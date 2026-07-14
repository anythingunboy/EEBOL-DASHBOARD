const express = require("express");
const cors = require("cors");
const fs = require("fs");

const { readWords, wordsToAscii, AREA } = require("./fins");

const app = express();
app.use(cors());
app.use(express.static("public"));

// ============================
// LOAD CONFIG
// ============================
const CONFIG = JSON.parse(fs.readFileSync("./config.json", "utf-8"));

// ============================
// ADDRESS PLC
// ============================
const TEMP_ADDR = [206, 706, 1206, 1706, 2206, 2706]; //EM0
const LOT_ADDR  = [70, 570, 1070, 1570, 2070, 2570]; //EM0
const COND_ADDR = [224, 724, 1224, 1724, 2224, 2724]; //EM0

const HOUR_ADDR = [3046, 3146, 3246, 3346, 3446, 3546]; //D
const MIN_ADDR  = [3047, 3147, 3247, 3347, 3447, 3547]; //D

const ON_WORD = 20;           //POWER MACHINE
const ON_BIT = [3,4,5,6,7,8]; //W 20.3-8 

const STATUS_WORD = [32,33,34,35,36,37];  //MES MANUAL DETECT
const STATUS_BIT = 15; //W 32.15 33.15 34.15

const MAIN_POLL_MS = 5000;

// ============================
// APPLY CONFIG
// ============================
CONFIG.machines = CONFIG.machines.map(m => ({
  ...m,
  // FIX: was hardcoded to 9622 for every machine, which overwrote the
  // real per-machine ports from config.json (9631, 9632, ... 9601, ...).
  // Only whichever machine actually listened on 9622 could ever respond.
  // Now each machine keeps its own port from config.json.
  port: m.port,
  plcNode: Number(m.ip.split(".")[3]), //
  pcNode: 36
}));

// ============================
// READ MAIN
// ============================
async function readMachineMain(machine) {

  const data = {};

  // Time
  try {
    const h = await readWords(machine, AREA.D, HOUR_ADDR[0], 1);
    const m = await readWords(machine, AREA.D, MIN_ADDR[0], 1);
    data.Hour = h[0];
    data.Min  = m[0];
  } catch {
    data.Hour = null;
    data.Min  = null;
  }

  try {
    //ON READ
    const w = await readWords(machine, AREA.W, ON_WORD, 1);

    let On_read = false;

    for (let i = 0; i < 6; i++) {
      if (((w[0] >> ON_BIT[i]) & 1) === 1) {
        On_read = true;
        break;
      }
    }

    // STATUS READ
    const ws = await readWords(machine, AREA.W, 32, 6);

    let Status_read = false;
    for (let i = 0; i < 6; i++) {
      if (((ws[i] >> STATUS_BIT) & 1) === 1) {
        Status_read = true;
        break;
      }
    }

    // Mode set
    data.On = On_read;
    data.Status = Status_read;

    if (!On_read) {
      data.Mode = "offline";
    } else if (Status_read) {
      data.Mode = "manual";
    } else { 
      data.Mode = "mes";
    }

  } catch(err) {
    throw err;
  }

  return data;
}

//(Add)For Edit Read EM0 Fisrt 16bit but need to read 32bit that mean 16+16 and float
async function readFloat(machine, area, addr) {

    const w = await readWords(machine, area, addr, 2);

    const buf = Buffer.alloc(4);

    // Word Swap (3412)
    buf.writeUInt16BE(w[1], 0);
    buf.writeUInt16BE(w[0], 2);

    return buf.readFloatBE(0);
}


// ============================
//  READ DETAIL
// ============================
async function readMachineDetail(machine) {

  const result = {};

  for (let i = 0; i < 6; i++) {

    try {
      const temp = await readFloat(machine, AREA.EM0, TEMP_ADDR[i], 1); //Change to readFloat
      result[`Temp_Bath${i+1}`] = Math.round(temp);
      console.log( machine.id, `Bath${i + 1}`, "TEMP=", temp ); //Add Log data
      
    } catch {
      result[`Temp_Bath${i+1}`] = null;
    }

    try {
      const cond = await readFloat(machine, AREA.EM0, COND_ADDR[i], 1);  //Change to readFloat
      result[`Cond_Bath${i+1}`] = Math.round(cond);
      console.log( machine.id, `Bath${i + 1}`, "COND =", cond ); //Add Log data
    } catch {
      result[`Cond_Bath${i+1}`] = null;
    }

    try {
      const lot = await readWords(machine, AREA.EM0, LOT_ADDR[i], 10);
      const lotNo = wordsToAscii(lot);
      result[`Lot_Bath${i+1}`] = lotNo;
      console.log( machine.id, `Bath${i+1}`, "LOT =", lotNo ); //Add Log data
    } catch {
      result[`Lot_Bath${i+1}`] = "";
    }

    try {
      const hour = await readWords(machine, AREA.D, HOUR_ADDR[i], 1);
      result[`Hour_Bath${i+1}`] = hour[0]; 
      console.log( machine.id, `Bath${i + 1}`, "HOUR=", hour[0] ); //Add Log data
    } catch {
      result[`Hour_Bath${i+1}`] = null;
    }

    try {
      const min = await readWords(machine, AREA.D, MIN_ADDR[i], 1);
      result[`Min_Bath${i+1}`] = min[0];
      console.log( machine.id, `Bath${i + 1}`, "MIN=", min[0] ); //Add Log data
    } catch {
      result[`Min_Bath${i+1}`] = null;
    }

    try {
      const w = await readWords(machine, AREA.W, ON_WORD, 1);
      const run = ((w[0] >> ON_BIT[i]) & 1) === 1;
      result[`Run_Bath${i+1}`] = run;
      console.log( machine.id, `Bath${i + 1}`, "ON STATUS=", run ); //Add Log data
    } catch {
      result[`Run_Bath${i+1}`] = null;
    }

    try {
      const w2 = await readWords(machine, AREA.W, STATUS_WORD[i], 1);
      const status = ((w2[0] >> STATUS_BIT) & 1) === 1;
      result[`Status_Bath${i+1}`] = status;
      console.log( machine.id, `Bath${i + 1}`, "MES STATUS=", status ); //Add Log data
    } catch {
      result[`Status_Bath${i+1}`] = null;
    }
  }
  return result;
}
// ============================
// CACHE (main)
// ============================
const CACHE = {};
let mainPollRunning = false;

function updateMachineCache(machine, data) {

  const previous = CACHE[machine.id] || {};
  const previousData = previous.data || {};

  CACHE[machine.id] = {
    name: machine.name,
    data: {
      ...previousData,
      ...data
    },
    stale: false,
    lastUpdated: new Date().toISOString()
  };
}

function markMachinePollError(machine, err) {

  const previous = CACHE[machine.id] || {};

  CACHE[machine.id] = {
    name: machine.name,
    data: {
      ...(previous.data || {}),
      Status: "offline",
      Mode: "offline"
    },
    stale: true,
    error: err.message,
    lastUpdated: previous.lastUpdated || null
  };
  
  console.log(
    machine.id,
    "OFFLINE =>",
    err.message
  );
}

// ============================
// ✅ POLLING MAIN ONLY
// ============================
async function pollMainOnce() {
  if (mainPollRunning) {
    console.log("Skipping MAIN poll; previous poll still running");
    return;
  }

  mainPollRunning = true;

  console.log("🚀 Polling MAIN");

  try {
    for (const machine of CONFIG.machines) {
      try {
        const data = await readMachineMain(machine);
        updateMachineCache(machine, data);
      } catch (err) {
        markMachinePollError(machine, err);
      }
    }
  } finally {
    mainPollRunning = false;
  }
}

async function pollMainLoop() {
  await pollMainOnce();
  setTimeout(pollMainLoop, MAIN_POLL_MS);
}

pollMainLoop();

// ============================
// ✅ API MAIN
// ============================
app.get("/api/all", (req, res) => {
  res.json(CACHE);
});

// ============================
// ✅ API DETAIL
// ============================
app.get("/api/machine/:id", async (req, res) => {

  const machine = CONFIG.machines.find(m => m.id === req.params.id);

  if (!machine) {
    return res.json({ error: "not found" });
  }

  console.log("Reading detail:", machine.id);

  try {

    const data = await readMachineDetail(machine)

    res.json({
      id: machine.id,
      name: machine.name,
      data
    });

  } catch (err) {

    res.json({
      error: err.message
    });

  }

});



// ============================
app.listen(3000, "0.0.0.0" ,() => {
  console.log("✅ Server running: http://localhost:3000");
});
