const os = require('os');
const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(os.tmpdir(), 'claude-status-test-' + process.pid);
process.env.CLAUDE_STATUS_DIR = TEST_DIR;

const { readState, updateSession, clearAllSessions, purgeOldSessions } = require('../src/state-manager');

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
  expect(typeof state.sessions['sess1'].lastUpdate).toBe('number');
});

test('readState survives corrupted file gracefully', () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_DIR, 'sessions.json'), 'not json');
  expect(readState()).toEqual({ version: 1, sessions: {} });
});

test('clearAllSessions empties all sessions', () => {
  updateSession('sess1', 'processing');
  updateSession('sess2', 'waiting');
  clearAllSessions();
  expect(readState().sessions).toEqual({});
});

test('purgeOldSessions removes sessions older than threshold', () => {
  const now = Math.floor(Date.now() / 1000);
  updateSession('fresh', 'waiting');
  const state = readState();
  state.sessions['stale'] = { status: 'waiting', lastUpdate: now - 5000, source: 'claude-code' };
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_DIR, 'sessions.json'), JSON.stringify(state));

  purgeOldSessions(1200);

  const after = readState();
  expect(after.sessions['stale']).toBeUndefined();
  expect(after.sessions['fresh']).toBeDefined();
});
