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
    alertedAt: state.sessions[sessionId]?.alertedAt ?? null
  };
  writeState(state);
}

function dismissSession(sessionId) {
  const state = readState();
  if (!state.sessions[sessionId]) return;
  state.sessions[sessionId].status = 'idle';
  state.sessions[sessionId].lastUpdate = Math.floor(Date.now() / 1000);
  writeState(state);
}

function keepWatchingSession(sessionId) {
  const state = readState();
  if (!state.sessions[sessionId]) return;
  state.sessions[sessionId].alertedAt = Math.floor(Date.now() / 1000);
  writeState(state);
}

module.exports = { readState, updateSession, dismissSession, keepWatchingSession };
