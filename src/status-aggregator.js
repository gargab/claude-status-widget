function computeAggregateStatus(sessions) {
  const statuses = Object.values(sessions).map(s => s.status);
  if (statuses.includes('waiting')) return 'red';
  if (statuses.includes('processing')) return 'yellow';
  return 'green';
}

function getStaleWaitingSessions(sessions, thresholdSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return Object.entries(sessions)
    .filter(([, s]) =>
      s.status === 'waiting' &&
      (now - s.lastUpdate) > thresholdSeconds &&
      (s.alertedAt == null || (now - s.alertedAt) > thresholdSeconds)
    )
    .map(([id]) => id);
}

module.exports = { computeAggregateStatus, getStaleWaitingSessions };
