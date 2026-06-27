const panel = document.getElementById('panel');
const lights = {
  red: document.getElementById('light-red'),
  yellow: document.getElementById('light-yellow'),
  green: document.getElementById('light-green')
};

let lastStatus = null;

function clearLights() {
  lights.red.className = 'light';
  lights.yellow.className = 'light';
  lights.green.className = 'light';
}

function applyStatus(status) {
  clearLights();
  if (status === 'red') lights.red.className = 'light active-red';
  else if (status === 'yellow') lights.yellow.className = 'light active-yellow';
  else lights.green.className = 'light active-green';
}

function maybePlaySound(status, muted) {
  if (muted || status === lastStatus) return;
  if (status === 'red') playRedSound();
  else if (status === 'green') playGreenSound();
}

window.claudeStatus.onStatusUpdate(({ status, muted }) => {
  applyStatus(status);
  panel.classList.toggle('muted', muted);
  maybePlaySound(status, muted);
  lastStatus = status;
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.claudeStatus.showContextMenu();
});
