// Sessions with no activity for 20 min → RED (stuck, crashed, or forgotten)
const STALE_THRESHOLD_SECONDS = 1200;

function computeAggregateStatus(sessions) {
  const now = Math.floor(Date.now() / 1000);
  const values = Object.values(sessions);

  // YELLOW: actively processing and under threshold
  const isProcessing = values.some(s =>
    s.status === 'processing' &&
    (now - (s.lastUpdate || 0)) < STALE_THRESHOLD_SECONDS
  );

  // RED: only processing sessions stuck beyond threshold (crashed or hung)
  // waiting = Claude finished — never RED, just GREEN regardless of age
  const isStale = values.some(s =>
    s.status === 'processing' &&
    (now - (s.lastUpdate || 0)) >= STALE_THRESHOLD_SECONDS
  );

  if (isStale) return 'red';
  if (isProcessing) return 'yellow';
  return 'green';
}

module.exports = { computeAggregateStatus };
