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
const TEMP_ADDR = [206, 706, 1206, 1706, 2206, 2706];
const LOT_ADDR  = [70, 570, 1070, 1570, 2070, 2570];
const COND_ADDR = [224, 724, 1224, 1724, 2224, 2724];

const HOUR_ADDR = [3046, 3146, 3246, 3346, 3446, 3546];
const MIN_ADDR  = [3047, 3147, 3247, 3347, 3447, 3547];

const STATUS_WORD = 20;
const STATUS_BIT = [3,4,5,6,7,8]; //w20.3-8

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
  plcNode: Number(m.ip.split(".")[3]), // ✅ ต้องเป็นแบบนี้
  pcNode: 36
}));

// ============================
// ✅ READ MAIN (เบา)
// ============================
async function readMachineMain(machine) {

  const data = {};

  try {
    const h = await readWords(machine, AREA.D, HOUR_ADDR[0], 1);
    const m = await readWords(machine, AREA.D, MIN_ADDR[0], 1);
    data.Hour = h[0];
    data.Min  = m[0];
  } catch {
    data.Hour = null;
    data.Min  = null;
  }

  // Find status
  try {
    const w = await readWords(machine, AREA.W, STATUS_WORD, 1);

    let running = false;

    for (let i = 0; i < 6; i++) {
      if (((w[0] >> STATUS_BIT[i]) & 1) === 1) {
        running = true;
        break;
      }
    }

    data.Status = running ? "online" : "off";

  } catch {
    data.Status = "offline";
  }

  return data;
}

// ============================
// ✅ READ DETAIL
// ============================
async function readMachineDetail(machine) {

  const result = {};

  for (let i = 0; i < 6; i++) {

    try {
      const temp = await readWords(machine, AREA.EM0, TEMP_ADDR[i], 1);
      result[`Temp_Bath${i+1}`] = temp[0];
    } catch {
      result[`Temp_Bath${i+1}`] = null;
    }

    try {
      const cond = await readWords(machine, AREA.EM0, COND_ADDR[i], 1);
      result[`Cond_Bath${i+1}`] = cond[0] / 100;
    } catch {
      result[`Cond_Bath${i+1}`] = null;
    }

    try {
      const lot = await readWords(machine, AREA.EM0, LOT_ADDR[i], 10);
      result[`Lot_Bath${i+1}`] = wordsToAscii(lot);
    } catch {
      result[`Lot_Bath${i+1}`] = "";
    }

    try {
      const hour = await readWords(machine, AREA.D, HOUR_ADDR[i], 1);
      result[`Hour_Bath${i+1}`] = hour[0];
    } catch {
      result[`Hour_Bath${i+1}`] = null;
    }

    try {
      const min = await readWords(machine, AREA.D, MIN_ADDR[i], 1);
      result[`Min_Bath${i+1}`] = min[0];
    } catch {
      result[`Min_Bath${i+1}`] = null;
    }

    try {
      const w = await readWords(machine, AREA.W, STATUS_WORD, 1);
      result[`Run_Bath${i+1}`] = ((w[0] >> STATUS_BIT[i]) & 1) === 1;
    } catch {
      result[`Run_Bath${i+1}`] = null;
    }
  }

  return result;
}

// ============================
// CACHE (main)
// ============================
const CACHE = {};

// ============================
// ✅ POLLING MAIN ONLY
// ============================
setInterval(async () => {

  console.log("🚀 Polling MAIN");

  for (const machine of CONFIG.machines) {

    try {

      const data = await readMachineMain(machine);

      CACHE[machine.id] = {
        name: machine.name,
        data
      };

    } catch {
      CACHE[machine.id] = {
        error: "offline"
      };
    }
  }

}, 3000);

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

    const data = await readMachineDetail(machine);

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
app.listen(3000, () => {
  console.log("✅ Server running: http://localhost:3000");
});
