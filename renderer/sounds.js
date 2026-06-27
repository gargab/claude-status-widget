let _ctx = null;
function getCtx() {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

function playTone(frequency, duration, type = 'square', gain = 0.3) {
  try {
    const ctx = getCtx();
    ctx.resume().then(() => {
      const t = ctx.currentTime + 0.01; // small offset to survive resume latency
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = frequency;
      gainNode.gain.setValueAtTime(gain, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t);
      osc.stop(t + duration);
    });
  } catch { /* audio context unavailable */ }
}

function playRedSound() {
  playTone(880, 0.12, 'square');
  setTimeout(() => playTone(660, 0.18, 'square'), 130);
}

function playGreenSound() {
  playTone(523, 0.15, 'square', 0.2);
  setTimeout(() => playTone(659, 0.15, 'square', 0.2), 150);
  setTimeout(() => playTone(784, 0.3,  'square', 0.2), 300);
}

function playFanfare() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, 'square'), i * 100);
  });
}
