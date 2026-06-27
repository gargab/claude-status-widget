let _ctx = null;
function getCtx() {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

function playTone(frequency, duration, type = 'square') {
  try {
    const ctx = getCtx();
    ctx.resume().then(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    });
  } catch { /* audio context unavailable */ }
}

function playRedSound() {
  playTone(880, 0.12, 'square');
  setTimeout(() => playTone(660, 0.18, 'square'), 130);
}

function playGreenSound() {
  playTone(440, 0.08, 'sine');
  setTimeout(() => playTone(880, 0.2, 'sine'), 90);
}

function playFanfare() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, 'square'), i * 100);
  });
}
