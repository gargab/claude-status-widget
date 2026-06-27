const os = require('os');
const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(os.tmpdir(), 'claude-status-test-' + process.pid);
process.env.CLAUDE_STATUS_DIR = TEST_DIR;

const { readState, updateSession, dismissSession, keepWatchingSession } = require('../src/state-manager');

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

test('readState returns empty state when no file exists', () => {
  expect(readState()).toEqual({ version: 1, sessions: {} });
});

test('updateSession creates session with correct status', () => {
  updateSession('sess1', 'processing');
  const state = readState();
  expect(state.sessions['sess1'].status).toBe('processing');
  expect(state.sessions['sess1'].source).toBe('claude-code');
  expect(state.sessions['sess1'].alertedAt).toBeNull();
  expect(typeof state.sessions['sess1'].lastUpdate).toBe('number');
});

test('updateSession preserves alertedAt on status update', () => {
  updateSession('sess1', 'waiting');
  const state = readState();
  state.sessions['sess1'].alertedAt = 999;
  fs.writeFileSync(path.join(TEST_DIR, 'sessions.json'), JSON.stringify(state));
  updateSession('sess1', 'processing');
  expect(readState().sessions['sess1'].alertedAt).toBe(999);
});

test('dismissSession sets status to idle', () => {
  updateSession('sess1', 'waiting');
  dismissSession('sess1');
  expect(readState().sessions['sess1'].status).toBe('idle');
});

test('keepWatchingSession updates alertedAt to now', () => {
  updateSession('sess1', 'waiting');
  const before = Math.floor(Date.now() / 1000);
  keepWatchingSession('sess1');
  const after = Math.floor(Date.now() / 1000);
  const { alertedAt } = readState().sessions['sess1'];
  expect(alertedAt).toBeGreaterThanOrEqual(before);
  expect(alertedAt).toBeLessThanOrEqual(after);
});

test('readState survives corrupted file gracefully', () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_DIR, 'sessions.json'), 'not json');
  expect(readState()).toEqual({ version: 1, sessions: {} });
});
