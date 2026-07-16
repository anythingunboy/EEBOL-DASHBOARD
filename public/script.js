const POLL_MS = 3000; // matches backend's setInterval polling rate

const grid = document.getElementById('machineGrid');
const overlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalMachineName = document.getElementById('modalMachineName');
const bathGrid = document.getElementById('bathGrid');
const modalLoading = document.getElementById('modalLoading');
const lampGreen = document.getElementById('lampGreen');
const lampGray = document.getElementById('lampGray');
const lampYellow = document.getElementById('lampYellow'); //Add yellow
const lampDarkGreen = document.getElementById('lampDarkGreen'); //Add Dark green

// ---------------------------------------------------------------------
// GRID — poll GET /api/all (the lightweight CACHE the backend already
// maintains from its own background polling loop).
// ---------------------------------------------------------------------
async function refreshGrid() {
  try {
    const res = await fetch('/api/all');
    const cache = await res.json();
    render(cache);
  } catch (err) {
    console.error('Failed to load /api/all', err);
  }
}

function render(cache) {

  const ids = Object.keys(cache).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  let total = 0, online = 0, mes = 0, manual = 0, nowip = 0, offline = 0;

  grid.innerHTML = '';

  ids.forEach((id) => {

    const entry = cache[id];
    total++;

    const isStale = !!entry.stale;

    const mode = entry.data && entry.data.Mode ? entry.data.Mode : "offline";

    let statusClass = mode;
    let statusText = mode.toUpperCase();

    //MODE
    if (mode === "manual") {
      manual++;
    } else if (mode === "mes") {
      mes++;
    } else if (mode === "nowip") {
      nowip++;
    } else if (mode === "idle"){
      idle++;
    } else if (mode === "offline") {
      offline++;
  }

    
if (mode === "mes" || mode === "manual" || mode === "nowip") {
    online++;
}

    const name = entry.name || id;

    const card = document.createElement('div');
    card.className = `machine-card ${statusClass}`;

    card.innerHTML = `
      <div class="mc-name">${name}</div>
      <div class="mc-status ${statusClass}">${statusText}</div>
    `;

    card.addEventListener('click', () => openMachinePopup(id, name));

    grid.appendChild(card);
  });

  document.getElementById('sumTotal').textContent = total;
  document.getElementById('sumOnline').textContent = online;
  document.getElementById('sumMES').textContent = mes; //Add MES
  document.getElementById('sumMANUAL').textContent = manual; //Add Manual
  // document.getElementById('sumNOWIP').textContent = nowip; //Add nowip
  //document.getElementById('sumIDLE').textContent = idle; //Add Idle
  document.getElementById('sumOffline').textContent = offline;
}

refreshGrid();
setInterval(refreshGrid, POLL_MS);

// ---------------------------------------------------------------------
// POPUP — GET /api/machine/:id, read live on click only (matches the
// backend's on-demand readMachineDetail — not part of the background poll).
// ---------------------------------------------------------------------
async function openMachinePopup(id, name) {
  modalMachineName.textContent = `No. ${id}`;
  overlay.classList.add('open');
  bathGrid.innerHTML = '';
  modalLoading.style.display = 'block';
  setLamp('none');

  try {
    const res = await fetch(`/api/machine/${id}`);
    const payload = await res.json();
    modalLoading.style.display = 'none';

    if (payload.error) {
      bathGrid.innerHTML = `<div class="modal-loading">Failed to read PLC: ${payload.error}</div>`;
      setLamp('red');
      return;
    }
    renderBathDetail(payload.data);
  } catch (err) {
    modalLoading.style.display = 'none';
    bathGrid.innerHTML = `<div class="modal-loading">Failed to read PLC: ${err.message}</div>`;
    setLamp('red');
  }
}

function renderBathDetail(data) {
  bathGrid.innerHTML = '';

  const anyRunning = [1, 2, 3, 4, 5, 6].some((i) => data[`Run_Bath${i}`]);
  setLamp(anyRunning ? 'green' : 'red');

  for (let i = 1; i <= 6; i++) {
    const running = !!data[`Run_Bath${i}`];
    const Status_state = !!data[`Status_Bath${i}`]; //Add status 
    const temp = data[`Temp_Bath${i}`] ?? '-';
    const cond = data[`Cond_Bath${i}`] ?? '-';
    const lot = data[`Lot_Bath${i}`] || '-';
    const hour = data[`Hour_Bath${i}`] ?? '-';
    const min = data[`Min_Bath${i}`] ?? '-';

    const card = document.createElement('div');
    card.className = 'bath-card';
    card.innerHTML = `
      <div class="bath-title">BATH ${i}</div>
      <div class="bath-row"><span class="label">Mode</span>
        <span class="run-tag ${Status_state ? 'manual' : 'mes'}">${Status_state ? 'MANUAL' : 'MES'}</span></div>
      <div class="bath-row"><span class="label">Lot No.</span><span class="value">${lot}</span></div>
      <div class="bath-row"><span class="label">Time</span><span class="value">${hour} Hour ${min} Minute</span></div>
      <div class="bath-row"><span class="label">Conduct</span><span class="value">${cond} &micro;S/cm</span></div>
      <div class="bath-row"><span class="label">Temp</span><span class="value">${temp} &deg;C</span></div>
    `;
    bathGrid.appendChild(card);
  }
}

function setLamp(state) {
  lampGreen.classList.toggle('active', state === 'green');
  lampGray.classList.toggle('active', state === 'gray');
  
}

modalClose.addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) overlay.classList.remove('open');
});

//DATE and TIME
function updateDateTime() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", {hour: "numeric",minute: "2-digit",second: "2-digit"
  });
  const date = now.toLocaleDateString("en-US", {weekday: "long",year: "numeric",month: "long",day: "numeric"
  });
  document.getElementById("time").textContent = time;
  document.getElementById("date").textContent = date;
}
updateDateTime();
setInterval(updateDateTime, 1000);