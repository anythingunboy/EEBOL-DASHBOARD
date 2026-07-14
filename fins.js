const dgram = require("dgram");
const client = dgram.createSocket("udp4");
const fins = require('omron-fins');
const debug = true;
const clients = [];
const responses = {};
const pendingRequests = new Map();
let nextSid = 1;

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
function requestKey(ip, port, sid) {
  return `${ip}:${port}:${sid}`;
}

function allocateSid(machine) {
  for (let i = 0; i < 255; i++) {
    const sid = nextSid;
    nextSid = nextSid === 255 ? 1 : nextSid + 1;

    if (!pendingRequests.has(requestKey(machine.ip, machine.port, sid))) {
      return sid;
    }
  }

  throw new Error("No available FINS SID");
}

client.on("message", (msg, rinfo) => {
  const sid = msg[9];
  let key = requestKey(rinfo.address, rinfo.port, sid);
  let pending = pendingRequests.get(key);

  // Some PLCs reply from a different UDP source port. Keep the SID/address
  // match strict, but tolerate that port difference.
  if (!pending) {
    for (const [candidateKey, candidate] of pendingRequests) {
      if (candidate.ip === rinfo.address && candidate.sid === sid) {
        key = candidateKey;
        pending = candidate;
        break;
      }
    }
  }

  if (!pending) return;

  pendingRequests.delete(key);
  clearTimeout(pending.timer);
  pending.resolve(msg);
});

function createHeader(machine, sid) {

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

  b[9] = sid;

  return b;
}

// ============================
// ✅ SEND FINS (simple + safe)
// ============================
function sendFinsRaw(machine, cmd) {

  return new Promise((resolve, reject) => {

    const sid = allocateSid(machine);
    const header = createHeader(machine, sid);
    const packet = Buffer.concat([header, cmd]);
    const key = requestKey(machine.ip, machine.port, sid);

    let done = false;

    const settle = (fn, value) => {
      if (done) return;

      done = true;
      clearTimeout(timer);
      pendingRequests.delete(key);
      fn(value);
    };

    const timer = setTimeout(() => {
      settle(reject, new Error(`Timeout reading ${machine.id}`));
    }, 3000);

    pendingRequests.set(key, {
      ip: machine.ip,
      port: machine.port,
      sid,
      timer,
      resolve: (msg) => settle(resolve, msg),
      reject: (err) => settle(reject, err)
    });

    client.send(packet, machine.port, machine.ip, (err) => {
      if (err) {
        const pending = pendingRequests.get(key);
        if (pending) pending.reject(err);
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

  const res = await sendFinsRaw(machine, cmd);

  if (res.length < 14) {
    throw new Error(`Short FINS response from ${machine.id}`);
  }

  const endCode = res.readUInt16BE(12);
  if (endCode !== 0) {
    throw new Error(`FINS end code ${endCode.toString(16)} from ${machine.id}`);
  }

  const result = [];
  const max = Math.floor((res.length - 14) / 2);

  for (let i = 0; i < Math.min(count, max); i++) {
    result.push(res.readUInt16BE(14 + i * 2));
  }

  if (result.length < count) {
    throw new Error(`Incomplete FINS response from ${machine.id}`);
  }

  return result;
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
