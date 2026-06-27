const { computeAggregateStatus, getStaleWaitingSessions } = require('../src/status-aggregator');

test('returns red when any session is waiting', () => {
  const sessions = {
    a: { status: 'waiting', lastUpdate: 0, alertedAt: null },
    b: { status: 'processing', lastUpdate: 0, alertedAt: null }
  };
  expect(computeAggregateStatus(sessions)).toBe('red');
});

test('returns yellow when processing and no waiting', () => {
  const sessions = {
    a: { status: 'processing', lastUpdate: 0, alertedAt: null },
    b: { status: 'idle', lastUpdate: 0, alertedAt: null }
  };
  expect(computeAggregateStatus(sessions)).toBe('yellow');
});

test('returns green when all sessions are idle', () => {
  expect(computeAggregateStatus({
    a: { status: 'idle', lastUpdate: 0, alertedAt: null }
  })).toBe('green');
});

test('returns green when sessions object is empty', () => {
  expect(computeAggregateStatus({})).toBe('green');
});

test('getStaleWaitingSessions returns IDs past threshold', () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions = {
    stale: { status: 'waiting', lastUpdate: now - 3700, alertedAt: null },
    fresh: { status: 'waiting', lastUpdate: now - 100, alertedAt: null },
    idle: { status: 'idle', lastUpdate: now - 9999, alertedAt: null }
  };
  expect(getStaleWaitingSessions(sessions, 3600)).toEqual(['stale']);
});

test('getStaleWaitingSessions skips sessions alerted recently', () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions = {
    a: { status: 'waiting', lastUpdate: now - 5000, alertedAt: now - 100 }
  };
  expect(getStaleWaitingSessions(sessions, 3600)).toEqual([]);
});

test('getStaleWaitingSessions returns stale session when alertedAt is undefined', () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions = {
    noAlertedAt: { status: 'waiting', lastUpdate: now - 3700 }
  };
  expect(getStaleWaitingSessions(sessions, 3600)).toEqual(['noAlertedAt']);
});
