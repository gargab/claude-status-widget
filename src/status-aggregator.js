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

  // RED: any session stale beyond threshold
  const isStale = values.some(s =>
    (s.status === 'waiting' || s.status === 'processing') &&
    (now - (s.lastUpdate || 0)) >= STALE_THRESHOLD_SECONDS
  );

  if (isStale) return 'red';
  if (isProcessing) return 'yellow';
  return 'green';
}

module.exports = { computeAggregateStatus };
