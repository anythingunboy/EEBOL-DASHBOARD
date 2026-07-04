const dgram = require("dgram");
const client = dgram.createSocket("udp4");
const fins = require('omron-fins');
const debug = true;
const clients = [];
const responses = {};

// ============================
// AREA
// (word-area codes — used for readWords(). Bit-area codes are only
//  needed if you ever do a true single-bit read; not used currently.)
// ============================
const AREA = {
  EM0: 0xA0,
  D:   0x82,
  W:   0xB1   // FIX: was 0x31 (Work Area BIT code). readWords() parses
              // the response as 16-bit words, so the WORD area code
              // (0xB1) must be used here, not the bit code (0x31).
              // 0x31 made every word-read of W20 return a single byte
              // instead of the full 16-bit status word, so only bath 1's
              // bit (bit 0 of that byte) was ever read correctly.
};

const AREA_BIT = {
  W: 0x31 // kept for reference / future true bit-reads
};

// ============================
// CREATE HEADER
// ============================
function createHeader(machine) {

  const b = Buffer.alloc(10);

  b[0] = 0x80;
  b[1] = 0x00;
  b[2] = 0x02;
  b[3] = 0x00;

  b[4] = machine.plcNode; // DA1 = destination NODE number (was hardcoded 0x00)
  b[5] = 0x00;            // DA2 = destination UNIT number (was machine.plcNode — swapped)

  b[6] = 0x00;

  b[7] = machine.pcNode;
  b[8] = 0x00;

  b[9] = Math.floor(Math.random() * 255); // SID

  return b;
}

// ============================
// ✅ SEND FINS (simple + safe)
// ============================
function sendFinsRaw(machine, cmd) {

  return new Promise((resolve, reject) => {

    const header = createHeader(machine);
    const packet = Buffer.concat([header, cmd]);

    let done = false;

    const cleanup = () => {
      client.removeListener("message", onMsg);
    };

    const onMsg = (msg) => {

      if (done) return;

      done = true;
      clearTimeout(timer);
      cleanup();

      resolve(msg);
    };

    const timer = setTimeout(() => {

      if (done) return;

      done = true;
      cleanup();

      reject(new Error("Timeout"));

    }, 1000);

    client.once("message", onMsg);

    client.send(packet, machine.port, machine.ip, (err) => {
      if (err) {
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    });

  });
}

// ============================
// READ WORD
// ============================
async function readWords(machine, area, addr, count) {

  const cmd = Buffer.alloc(8);

  cmd[0] = 0x01;
  cmd[1] = 0x01;

  cmd[2] = area;

  cmd.writeUInt16BE(addr, 3);
  cmd[5] = 0x00;

  cmd.writeUInt16BE(count, 6);

  try {

    const res = await sendFinsRaw(machine, cmd);

    const result = [];

    const max = Math.floor((res.length - 14) / 2);

    for (let i = 0; i < Math.min(count, max); i++) {
      result.push(res.readUInt16BE(14 + i * 2));
    }

    return result;

  } catch {
    return []; //
  }
}

// ============================
// WORD → STRING
// ============================
function wordsToAscii(words) {

  if (!words || words.length === 0) return "";

  let str = "";

  for (const w of words) {
    str += String.fromCharCode((w >> 8) & 0xff);
    str += String.fromCharCode(w & 0xff);
  }

  return str.replace(/\0/g, "").trim();
}

module.exports = {
  readWords,
  wordsToAscii,
  AREA,
  AREA_BIT
};