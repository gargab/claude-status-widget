const { computeAggregateStatus } = require('../src/status-aggregator');

test('returns green when waiting session is stale (waiting never triggers red)', () => {
  const sessions = { a: { status: 'waiting', lastUpdate: 0 } };
  expect(computeAggregateStatus(sessions)).toBe('green');
});

test('returns green when waiting session is fresh (under 20 min)', () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions = { a: { status: 'waiting', lastUpdate: now - 30 } };
  expect(computeAggregateStatus(sessions)).toBe('green');
});

test('returns yellow when processing and fresh', () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions = {
    a: { status: 'processing', lastUpdate: now },
    b: { status: 'idle', lastUpdate: now }
  };
  expect(computeAggregateStatus(sessions)).toBe('yellow');
});

test('returns yellow for processing stuck under 20 min (e.g. Allow prompt)', () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions = { a: { status: 'processing', lastUpdate: now - 400 } };
  expect(computeAggregateStatus(sessions)).toBe('yellow');
});

test('returns red for processing session over 20 min (crashed or truly stuck)', () => {
  const sessions = { a: { status: 'processing', lastUpdate: 0 } };
  expect(computeAggregateStatus(sessions)).toBe('red');
});

test('returns green when all sessions are idle', () => {
  expect(computeAggregateStatus({
    a: { status: 'idle', lastUpdate: 0 }
  })).toBe('green');
});

test('returns green when sessions object is empty', () => {
  expect(computeAggregateStatus({})).toBe('green');
});
