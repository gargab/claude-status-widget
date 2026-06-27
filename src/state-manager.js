const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = process.env.CLAUDE_STATUS_DIR || path.join(os.homedir(), '.claude-status');
const STATE_FILE = path.join(STATE_DIR, 'sessions.json');
const EMPTY_STATE = { version: 1, sessions: {} };

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { ...EMPTY_STATE, sessions: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function updateSession(sessionId, status, source = 'claude-code') {
  const state = readState();
  state.sessions[sessionId] = {
    status,
    lastUpdate: Math.floor(Date.now() / 1000),
    source,
  };
  writeState(state);
}

function clearAllSessions() {
  writeState({ ...EMPTY_STATE });
}

function purgeOldSessions(olderThanSeconds) {
  const state = readState();
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  for (const [id, s] of Object.entries(state.sessions)) {
    if ((now - (s.lastUpdate || 0)) > olderThanSeconds) {
      delete state.sessions[id];
      changed = true;
    }
  }
  if (changed) writeState(state);
}

module.exports = { readState, updateSession, clearAllSessions, purgeOldSessions };
