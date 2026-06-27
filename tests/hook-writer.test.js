const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_SCRIPT = path.join(__dirname, '../hook/index.js');
const TEST_DIR = path.join(os.tmpdir(), 'hook-test-' + process.pid);
const STATE_FILE = path.join(TEST_DIR, 'sessions.json');

function runHook(payload) {
  return spawnSync('node', [HOOK_SCRIPT], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_STATUS_DIR: TEST_DIR }
  });
}

function readSessions() {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).sessions;
}

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

test('writes processing status on UserPromptSubmit', () => {
  runHook({ session_id: 's1', hook_event_name: 'UserPromptSubmit' });
  expect(readSessions()['s1'].status).toBe('processing');
});

test('writes processing status on PreToolUse', () => {
  runHook({ session_id: 's2', hook_event_name: 'PreToolUse' });
  expect(readSessions()['s2'].status).toBe('processing');
});

test('writes processing status on PostToolUse', () => {
  runHook({ session_id: 's3', hook_event_name: 'PostToolUse' });
  expect(readSessions()['s3'].status).toBe('processing');
});

test('writes waiting status on Stop', () => {
  runHook({ session_id: 's4', hook_event_name: 'Stop' });
  expect(readSessions()['s4'].status).toBe('waiting');
});

test('writes processing status on SubagentStop', () => {
  runHook({ session_id: 's5', hook_event_name: 'SubagentStop' });
  expect(readSessions()['s5'].status).toBe('processing');
});

test('exits 0 and writes nothing on malformed JSON', () => {
  const result = spawnSync('node', [HOOK_SCRIPT], {
    input: 'not json',
    env: { ...process.env, CLAUDE_STATUS_DIR: TEST_DIR }
  });
  expect(result.status).toBe(0);
  expect(fs.existsSync(STATE_FILE)).toBe(false);
});

test('exits 0 and writes nothing on unknown event', () => {
  runHook({ session_id: 's6', hook_event_name: 'UnknownEvent' });
  expect(fs.existsSync(STATE_FILE)).toBe(false);
});
