# Claude Status Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron-based floating arcade traffic light widget that monitors Claude Code session status in real time and shows Red/Yellow/Green based on whether sessions are waiting for input, processing, or idle.

**Architecture:** Claude Code lifecycle hooks write session state to `~/.claude-status/sessions.json` via a CLI hook handler. An Electron app watches that file with `chokidar`, computes aggregate status (Red > Yellow > Green precedence), and renders a frameless neon-glow traffic light widget. A global hotkey (`Cmd+Shift+S`) toggles visibility. After 1 hour of `waiting` with no user response, an arcade policeman dialog prompts the user to keep watching or dismiss.

**Tech Stack:** Electron 31, Node.js 20, chokidar 3, Jest 29, electron-builder 24, Web Audio API (no sound files needed)

## Global Constraints

- Node.js ≥ 20 required
- Electron 31.x — do not upgrade past this without testing
- State file: `~/.claude-status/sessions.json` — exact path, no deviation
- Config file: `~/.claude-status/config.json`
- Hook binary name: `claude-status-hook` — exact, Claude Code hooks reference this by name
- CLI binary name: `claude-status`
- State dir overridable via `CLAUDE_STATUS_DIR` env var (tests use this)
- Atomic writes only to state file (write `.tmp` → rename)
- `source` field in sessions is the v2 extensibility point — never hardcode `"claude-code"` as the only valid value
- No external font, image, or sound assets — CSS + Web Audio API only
- Widget window: 80×220px, frameless, transparent, always-on-top
- Dialog window: 400×300px, frameless, transparent, always-on-top
- Default hotkey: `CommandOrControl+Shift+S`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | npm metadata, bin entries, Jest config, electron-builder config |
| `main.js` | Electron main process: windows, chokidar, hotkey, IPC, 1hr timer |
| `preload.js` | Context bridge — exposes safe IPC API to all renderer windows |
| `src/state-manager.js` | Atomic read/write of `sessions.json` |
| `src/status-aggregator.js` | Pure functions: aggregate status, stale session detection |
| `src/config-manager.js` | Read/write `config.json` with defaults |
| `hook/index.js` | CLI: reads Claude Code hook stdin JSON → writes state |
| `cli/index.js` | CLI entry point: dispatches setup/uninstall/start commands |
| `cli/setup.js` | Injects hooks into `~/.claude/settings.json`, launches widget |
| `cli/uninstall.js` | Removes hooks from settings.json, kills widget process |
| `renderer/index.html` | Widget window HTML shell |
| `renderer/widget.css` | Arcade neon styles, CRT scanlines, glow effects |
| `renderer/widget.js` | IPC listener, DOM status updates |
| `renderer/sounds.js` | Web Audio API tone generation (no files) |
| `dialog/dialog.html` | Policeman alert window HTML |
| `dialog/dialog.css` | Dialog arcade styles matching widget theme |
| `dialog/dialog.js` | Typewriter animation, button handlers |
| `tests/state-manager.test.js` | Unit tests for state-manager |
| `tests/status-aggregator.test.js` | Unit tests for status-aggregator |
| `tests/config-manager.test.js` | Unit tests for config-manager |
| `tests/hook-writer.test.js` | Integration tests for hook/index.js |
| `.github/workflows/build.yml` | CI: build .dmg/.exe/.AppImage on tag push |
| `README.md` | Install instructions, demo, badge |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: `npm test` runs Jest; `npm start` launches Electron; `npm run build` packages app

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-status-widget",
  "version": "0.1.0",
  "description": "Arcade traffic light widget for Claude Code session status",
  "main": "main.js",
  "bin": {
    "claude-status": "./cli/index.js",
    "claude-status-hook": "./hook/index.js"
  },
  "scripts": {
    "start": "electron .",
    "test": "jest",
    "build": "electron-builder",
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win",
    "build:linux": "electron-builder --linux"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  },
  "dependencies": {
    "chokidar": "^3.6.0"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.9.0",
    "jest": "^29.7.0"
  },
  "build": {
    "appId": "com.claudestatuswidget",
    "productName": "Claude Status Widget",
    "files": ["**/*", "!docs", "!tests", "!*.test.js"],
    "mac": {
      "category": "public.app-category.utilities",
      "target": ["dmg", "zip"]
    },
    "win": {
      "target": ["nsis"]
    },
    "linux": {
      "target": ["AppImage"]
    }
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.tmp
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p src tests hook cli renderer dialog .github/workflows
```

- [ ] **Step 5: Verify Jest runs (no tests yet)**

```bash
npm test
```

Expected: `Test Suites: 0 passed` — Jest runs without error.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: project scaffold"
```

---

## Task 2: State Manager

**Files:**
- Create: `src/state-manager.js`
- Create: `tests/state-manager.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `readState()` → `{ version: 1, sessions: { [sessionId: string]: SessionEntry } }`
  - `updateSession(sessionId: string, status: string, source?: string)` → void
  - `dismissSession(sessionId: string)` → void
  - `keepWatchingSession(sessionId: string)` → void
  - `SessionEntry` shape: `{ status: string, lastUpdate: number, source: string, alertedAt: number|null }`

- [ ] **Step 1: Write failing tests**

Create `tests/state-manager.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/state-manager.test.js
```

Expected: FAIL — `Cannot find module '../src/state-manager'`

- [ ] **Step 3: Implement `src/state-manager.js`**

```javascript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/state-manager.test.js
```

Expected: `Tests: 6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/state-manager.js tests/state-manager.test.js
git commit -m "feat: state manager with atomic writes"
```

---

## Task 3: Status Aggregator

**Files:**
- Create: `src/status-aggregator.js`
- Create: `tests/status-aggregator.test.js`

**Interfaces:**
- Consumes: `SessionEntry` shape from Task 2
- Produces:
  - `computeAggregateStatus(sessions: object)` → `'red' | 'yellow' | 'green'`
  - `getStaleWaitingSessions(sessions: object, thresholdSeconds?: number)` → `string[]`

- [ ] **Step 1: Write failing tests**

Create `tests/status-aggregator.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/status-aggregator.test.js
```

Expected: FAIL — `Cannot find module '../src/status-aggregator'`

- [ ] **Step 3: Implement `src/status-aggregator.js`**

```javascript
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
      (s.alertedAt === null || (now - s.alertedAt) > thresholdSeconds)
    )
    .map(([id]) => id);
}

module.exports = { computeAggregateStatus, getStaleWaitingSessions };
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/status-aggregator.test.js
```

Expected: `Tests: 6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/status-aggregator.js tests/status-aggregator.test.js
git commit -m "feat: status aggregator with precedence logic"
```

---

## Task 4: Config Manager

**Files:**
- Create: `src/config-manager.js`
- Create: `tests/config-manager.test.js`

**Interfaces:**
- Consumes: `CLAUDE_STATUS_DIR` env var
- Produces:
  - `readConfig()` → `{ toggleHotkey: string, muted: boolean, windowPosition: { x: number, y: number } }`
  - `writeConfig(config: object)` → void

- [ ] **Step 1: Write failing tests**

Create `tests/config-manager.test.js`:

```javascript
const os = require('os');
const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(os.tmpdir(), 'claude-config-test-' + process.pid);
process.env.CLAUDE_STATUS_DIR = TEST_DIR;

const { readConfig, writeConfig } = require('../src/config-manager');

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  delete require.cache[require.resolve('../src/config-manager')];
});

test('readConfig returns defaults when no file exists', () => {
  const config = readConfig();
  expect(config.toggleHotkey).toBe('CommandOrControl+Shift+S');
  expect(config.muted).toBe(false);
  expect(config.windowPosition).toEqual({ x: 100, y: 100 });
});

test('writeConfig persists values, readConfig reads them back', () => {
  writeConfig({ toggleHotkey: 'CommandOrControl+Shift+X', muted: true, windowPosition: { x: 200, y: 300 } });
  const config = readConfig();
  expect(config.muted).toBe(true);
  expect(config.windowPosition).toEqual({ x: 200, y: 300 });
});

test('readConfig merges missing keys with defaults', () => {
  writeConfig({ muted: true });
  const config = readConfig();
  expect(config.toggleHotkey).toBe('CommandOrControl+Shift+S');
  expect(config.muted).toBe(true);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/config-manager.test.js
```

Expected: FAIL — `Cannot find module '../src/config-manager'`

- [ ] **Step 3: Implement `src/config-manager.js`**

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = process.env.CLAUDE_STATUS_DIR || path.join(os.homedir(), '.claude-status');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');

const DEFAULTS = {
  toggleHotkey: 'CommandOrControl+Shift+S',
  muted: false,
  windowPosition: { x: 100, y: 100 }
};

function readConfig() {
  try {
    const stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(config) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}

module.exports = { readConfig, writeConfig };
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/config-manager.test.js
```

Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/config-manager.js tests/config-manager.test.js
git commit -m "feat: config manager with defaults and merge"
```

---

## Task 5: Hook Writer CLI

**Files:**
- Create: `hook/index.js`
- Create: `tests/hook-writer.test.js`

**Interfaces:**
- Consumes: `updateSession()` from `src/state-manager.js`; Claude Code hook JSON on stdin
- Produces: binary `claude-status-hook` — reads stdin, writes state, exits 0

- [ ] **Step 1: Write failing tests**

Create `tests/hook-writer.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/hook-writer.test.js
```

Expected: FAIL — `Cannot find module '../hook/index.js'` or spawn errors

- [ ] **Step 3: Implement `hook/index.js`**

```javascript
#!/usr/bin/env node
const { updateSession } = require('../src/state-manager');

const EVENT_TO_STATUS = {
  UserPromptSubmit: 'processing',
  PreToolUse: 'processing',
  PostToolUse: 'processing',
  Stop: 'waiting',
  SubagentStop: 'processing'
};

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  try {
    const { session_id, hook_event_name } = JSON.parse(raw);
    const status = EVENT_TO_STATUS[hook_event_name];
    if (session_id && status) updateSession(session_id, status);
  } catch {
    // Malformed input — exit cleanly so Claude Code is never interrupted
  }
  process.exit(0);
}

main();
```

- [ ] **Step 4: Make hook executable**

```bash
chmod +x hook/index.js
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- tests/hook-writer.test.js
```

Expected: `Tests: 7 passed`

- [ ] **Step 6: Commit**

```bash
git add hook/index.js tests/hook-writer.test.js
git commit -m "feat: hook writer CLI"
```

---

## Task 6: Setup & Uninstall CLI

**Files:**
- Create: `cli/index.js`
- Create: `cli/setup.js`
- Create: `cli/uninstall.js`

**Interfaces:**
- Consumes: `~/.claude/settings.json` (Claude Code settings); `electron` npm package path; `app.setLoginItemSettings` (called at runtime)
- Produces: binaries `claude-status setup`, `claude-status uninstall`; side effect: modified `~/.claude/settings.json`

- [ ] **Step 1: Create `cli/index.js`**

```javascript
#!/usr/bin/env node
const [,, command] = process.argv;

const commands = {
  setup: () => require('./setup').run(),
  uninstall: () => require('./uninstall').run(),
  start: () => {
    const { spawn } = require('child_process');
    const electron = require('electron');
    const path = require('path');
    spawn(electron, [path.join(__dirname, '..')], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }
};

if (commands[command]) {
  commands[command]();
} else {
  console.log('Usage: claude-status [setup|uninstall|start]');
  process.exit(command ? 1 : 0);
}
```

- [ ] **Step 2: Create `cli/setup.js`**

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop'];
const HOOK_COMMAND = 'claude-status-hook';

function injectHooks(settingsPath) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
    catch { settings = {}; }
  }
  if (!settings.hooks) settings.hooks = {};

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    const alreadyPresent = settings.hooks[event].some(entry =>
      Array.isArray(entry.hooks) && entry.hooks.some(h => h.command === HOOK_COMMAND)
    );
    if (!alreadyPresent) {
      settings.hooks[event].push({
        matcher: '',
        hooks: [{ type: 'command', command: HOOK_COMMAND }]
      });
    }
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function run() {
  console.log('Injecting Claude Code hooks...');
  injectHooks(CLAUDE_SETTINGS);
  console.log(`✓ Hooks added to ${CLAUDE_SETTINGS}`);

  console.log('Launching widget...');
  const electron = require('electron');
  spawn(electron, [path.join(__dirname, '..')], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  console.log('✓ Claude Status Widget running. Press Cmd+Shift+S to show/hide.');
}

module.exports = { run, injectHooks };
```

- [ ] **Step 3: Create `cli/uninstall.js`**

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_COMMAND = 'claude-status-hook';

function removeHooks(settingsPath) {
  if (!fs.existsSync(settingsPath)) return;
  let settings;
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch { return; }
  if (!settings.hooks) return;

  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map(entry => ({
        ...entry,
        hooks: (entry.hooks || []).filter(h => h.command !== HOOK_COMMAND)
      }))
      .filter(entry => entry.hooks.length > 0);
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function run() {
  console.log('Removing hooks...');
  removeHooks(CLAUDE_SETTINGS);
  console.log('✓ Hooks removed.');

  try {
    execSync('pkill -f "Claude Status Widget"', { stdio: 'ignore' });
    console.log('✓ Widget stopped.');
  } catch { /* process not running */ }

  console.log('✓ Uninstall complete.');
}

module.exports = { run, removeHooks };
```

- [ ] **Step 4: Smoke-test setup on your machine**

```bash
node cli/index.js setup
```

Expected: hooks appear in `~/.claude/settings.json` under `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`. Electron window may fail to open (main.js not written yet) — that's expected at this stage.

- [ ] **Step 5: Smoke-test uninstall**

```bash
node cli/index.js uninstall
```

Expected: hooks removed from `~/.claude/settings.json`. Verify by inspecting the file.

- [ ] **Step 6: Commit**

```bash
git add cli/index.js cli/setup.js cli/uninstall.js
git commit -m "feat: setup and uninstall CLI"
```

---

## Task 7: Electron Main Process

**Files:**
- Create: `main.js`
- Create: `preload.js`

**Interfaces:**
- Consumes:
  - `readState()`, `dismissSession(id)`, `keepWatchingSession(id)` from `src/state-manager.js`
  - `computeAggregateStatus(sessions)`, `getStaleWaitingSessions(sessions)` from `src/status-aggregator.js`
  - `readConfig()`, `writeConfig(config)` from `src/config-manager.js`
- Produces:
  - IPC `status-update` → renderer: `{ status: 'red'|'yellow'|'green', muted: boolean }`
  - IPC `dialog-init` → dialog: `{ sessionId: string }`
  - IPC `show-context-menu` ← renderer (triggers native menu)
  - IPC `dismiss-session` ← dialog (with sessionId string)
  - IPC `keep-watching` ← dialog (with sessionId string)

No automated tests for this task — verify manually by running `npm start`.

- [ ] **Step 1: Create `preload.js`**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeStatus', {
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_e, data) => cb(data)),
  onDialogInit: (cb) => ipcRenderer.on('dialog-init', (_e, data) => cb(data)),
  dismissSession: (sessionId) => ipcRenderer.send('dismiss-session', sessionId),
  keepWatching: (sessionId) => ipcRenderer.send('keep-watching', sessionId),
  showContextMenu: () => ipcRenderer.send('show-context-menu')
});
```

- [ ] **Step 2: Create `main.js`**

```javascript
const { app, BrowserWindow, globalShortcut, ipcMain, Menu } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
const os = require('os');

const { readState, dismissSession, keepWatchingSession } = require('./src/state-manager');
const { computeAggregateStatus, getStaleWaitingSessions } = require('./src/status-aggregator');
const { readConfig, writeConfig } = require('./src/config-manager');

const STATE_FILE = path.join(
  process.env.CLAUDE_STATUS_DIR || path.join(os.homedir(), '.claude-status'),
  'sessions.json'
);

let widgetWindow = null;
let dialogWindow = null;
let watcher = null;

function createWidgetWindow() {
  const config = readConfig();
  widgetWindow = new BrowserWindow({
    width: 80,
    height: 220,
    x: config.windowPosition.x,
    y: config.windowPosition.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  widgetWindow.loadFile('renderer/index.html');
  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.on('moved', () => {
    const [x, y] = widgetWindow.getPosition();
    writeConfig({ ...readConfig(), windowPosition: { x, y } });
  });
}

function createDialogWindow(sessionId) {
  if (dialogWindow) return;
  dialogWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  dialogWindow.loadFile('dialog/dialog.html');
  dialogWindow.webContents.once('did-finish-load', () => {
    dialogWindow.webContents.send('dialog-init', { sessionId });
  });
  dialogWindow.on('closed', () => { dialogWindow = null; });
}

function pushStatusUpdate() {
  if (!widgetWindow) return;
  const state = readState();
  const status = computeAggregateStatus(state.sessions);
  const config = readConfig();
  widgetWindow.webContents.send('status-update', { status, muted: config.muted });

  const stale = getStaleWaitingSessions(state.sessions);
  if (stale.length > 0 && !dialogWindow) createDialogWindow(stale[0]);
}

app.whenReady().then(() => {
  createWidgetWindow();

  // Register login item (auto-start on system login)
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

  // Global hotkey to toggle widget visibility
  const config = readConfig();
  globalShortcut.register(config.toggleHotkey, () => {
    if (!widgetWindow) return;
    widgetWindow.isVisible() ? widgetWindow.hide() : widgetWindow.show();
  });

  // Watch state file and push updates
  watcher = chokidar.watch(STATE_FILE, { ignoreInitial: false, awaitWriteFinish: false });
  watcher.on('change', pushStatusUpdate);
  watcher.on('add', pushStatusUpdate);

  // Periodic stale-session check (catches sessions that don't update the file)
  setInterval(pushStatusUpdate, 60_000);

  // IPC: dialog actions
  ipcMain.on('dismiss-session', (_e, sessionId) => {
    dismissSession(sessionId);
    pushStatusUpdate();
    dialogWindow?.close();
  });
  ipcMain.on('keep-watching', (_e, sessionId) => {
    keepWatchingSession(sessionId);
    dialogWindow?.close();
  });

  // IPC: right-click context menu from widget
  ipcMain.on('show-context-menu', () => {
    const cfg = readConfig();
    const menu = Menu.buildFromTemplate([
      {
        label: cfg.muted ? 'Unmute' : 'Mute',
        click: () => {
          writeConfig({ ...readConfig(), muted: !readConfig().muted });
          pushStatusUpdate();
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    menu.popup({ window: widgetWindow });
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  watcher?.close();
});

// Keep app alive when all windows are closed (background daemon)
app.on('window-all-closed', () => {});
```

- [ ] **Step 3: Verify app starts without crashing**

```bash
npm start
```

Expected: Electron window opens (blank — renderer not built yet), no crash, no console errors about missing modules.

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat: Electron main process with IPC, hotkey, and file watcher"
```

---

## Task 8: Widget Renderer

**Files:**
- Create: `renderer/index.html`
- Create: `renderer/widget.css`
- Create: `renderer/widget.js`
- Create: `renderer/sounds.js`

**Interfaces:**
- Consumes: IPC `status-update` with `{ status: 'red'|'yellow'|'green', muted: boolean }` via `window.claudeStatus.onStatusUpdate`
- Produces: visible arcade traffic light that updates in real time; right-click fires `window.claudeStatus.showContextMenu()`

Verify manually with `npm start`.

- [ ] **Step 1: Create `renderer/sounds.js`**

```javascript
function playTone(frequency, duration, type = 'square') {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* audio context unavailable */ }
}

function playRedSound() {
  playTone(880, 0.12, 'square');
  setTimeout(() => playTone(660, 0.18, 'square'), 130);
}

function playGreenSound() {
  playTone(440, 0.08, 'sine');
  setTimeout(() => playTone(880, 0.2, 'sine'), 90);
}

function playFanfare() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, 'square'), i * 100);
  });
}
```

- [ ] **Step 2: Create `renderer/widget.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: transparent;
  -webkit-app-region: drag;
  user-select: none;
  overflow: hidden;
  font-family: monospace;
}

.panel {
  width: 80px;
  height: 220px;
  background: rgba(10, 10, 10, 0.92);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 22px 0;
  position: relative;
  overflow: hidden;
  transition: opacity 0.3s ease;
}

/* CRT scanlines */
.panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.05) 2px,
    rgba(0, 0, 0, 0.05) 4px
  );
  pointer-events: none;
  border-radius: 16px;
  z-index: 1;
}

.light {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #111;
  border: 2px solid #222;
  transition: background 0.35s ease, box-shadow 0.35s ease;
  -webkit-app-region: no-drag;
}

.light.active-red {
  background: #ff2020;
  border-color: #ff2020;
  box-shadow: 0 0 18px 7px rgba(255, 32, 32, 0.75);
}

.light.active-yellow {
  background: #ffd700;
  border-color: #ffd700;
  box-shadow: 0 0 18px 7px rgba(255, 215, 0, 0.75);
}

.light.active-green {
  background: #00ff44;
  border-color: #00ff44;
  box-shadow: 0 0 18px 7px rgba(0, 255, 68, 0.75);
}

.mute-badge {
  position: absolute;
  bottom: 7px;
  font-size: 9px;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.5px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 2;
  -webkit-app-region: no-drag;
}

.panel.muted { opacity: 0.4; }
.panel.muted .mute-badge { opacity: 1; }
```

- [ ] **Step 3: Create `renderer/index.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="widget.css">
</head>
<body>
  <div class="panel" id="panel">
    <div class="light" id="light-red"></div>
    <div class="light" id="light-yellow"></div>
    <div class="light" id="light-green"></div>
    <span class="mute-badge">MUTED</span>
  </div>
  <script src="sounds.js"></script>
  <script src="widget.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `renderer/widget.js`**

```javascript
const panel = document.getElementById('panel');
const lights = {
  red: document.getElementById('light-red'),
  yellow: document.getElementById('light-yellow'),
  green: document.getElementById('light-green')
};

let lastStatus = null;

function clearLights() {
  lights.red.className = 'light';
  lights.yellow.className = 'light';
  lights.green.className = 'light';
}

function applyStatus(status) {
  clearLights();
  if (status === 'red') lights.red.className = 'light active-red';
  else if (status === 'yellow') lights.yellow.className = 'light active-yellow';
  else lights.green.className = 'light active-green';
}

function maybePlaySound(status, muted) {
  if (muted || status === lastStatus) return;
  if (status === 'red') playRedSound();
  else if (status === 'green') playGreenSound();
}

window.claudeStatus.onStatusUpdate(({ status, muted }) => {
  applyStatus(status);
  panel.classList.toggle('muted', muted);
  maybePlaySound(status, muted);
  lastStatus = status;
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.claudeStatus.showContextMenu();
});
```

- [ ] **Step 5: Start app and verify widget renders**

```bash
npm start
```

Open `~/.claude-status/sessions.json` in a text editor and manually set a session to `waiting`, then `processing`, then `idle` — watch the traffic light update. Verify glow effects, CRT scanlines, right-click menu opens.

- [ ] **Step 6: Commit**

```bash
git add renderer/
git commit -m "feat: arcade widget renderer with neon glow and sounds"
```

---

## Task 9: Policeman Dialog

**Files:**
- Create: `dialog/dialog.html`
- Create: `dialog/dialog.css`
- Create: `dialog/dialog.js`

**Interfaces:**
- Consumes: IPC `dialog-init` with `{ sessionId: string }` via `window.claudeStatus.onDialogInit`
- Produces: calls `window.claudeStatus.keepWatching(sessionId)` or `window.claudeStatus.dismissSession(sessionId)` on button click

Verify manually: set a session `lastUpdate` to 2 hours ago in `sessions.json`, wait for the 1-minute polling cycle (or restart app), confirm dialog appears.

- [ ] **Step 1: Create `dialog/dialog.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: transparent;
  user-select: none;
  overflow: hidden;
  font-family: monospace;
}

.dialog-panel {
  width: 400px;
  height: 300px;
  background: rgba(10, 10, 10, 0.96);
  border-radius: 16px;
  border: 1px solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.15);
  display: flex;
  align-items: center;
  padding: 24px;
  gap: 20px;
  position: relative;
  overflow: hidden;
}

.dialog-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px
  );
  pointer-events: none;
  border-radius: 16px;
}

.officer {
  font-size: 64px;
  filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.6));
  flex-shrink: 0;
}

.message-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-text {
  color: #ffd700;
  font-size: 13px;
  line-height: 1.6;
  min-height: 72px;
}

.cursor {
  display: inline-block;
  width: 8px;
  height: 14px;
  background: #ffd700;
  animation: blink 0.8s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes blink { 50% { opacity: 0; } }

.buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  background: transparent;
  border: 1px solid #ffd700;
  color: #ffd700;
  font-family: monospace;
  font-size: 11px;
  padding: 7px 12px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  letter-spacing: 0.5px;
}

.btn:hover {
  background: #ffd700;
  color: #000;
}

.btn.dismiss { border-color: #ff2020; color: #ff2020; }
.btn.dismiss:hover { background: #ff2020; color: #000; }
```

- [ ] **Step 2: Create `dialog/dialog.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="dialog.css">
</head>
<body>
  <div class="dialog-panel">
    <div class="officer">👮</div>
    <div class="message-box">
      <div class="message-text" id="message">
        <span class="cursor"></span>
      </div>
      <div class="buttons">
        <button class="btn keep" id="btn-keep">[ KEEP WATCHING ]</button>
        <button class="btn dismiss" id="btn-dismiss">[ DISMISS IT ]</button>
      </div>
    </div>
  </div>
  <script src="../renderer/sounds.js"></script>
  <script src="dialog.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `dialog/dialog.js`**

```javascript
const MESSAGES = [
  "HEY ROOKIE! This session's been waiting on you for an HOUR! You ghostin' it or what?",
  "FREEZE! Claude's been waiting since before lunch. You coming back or should I close the case?",
  "HANDS WHERE I CAN SEE 'EM! A session's been idle for 60 minutes. Time to make a call, partner.",
  "THIS IS THE STATUS POLICE! Claude's hanging. You want it on the clock or off the books?"
];

let sessionId = null;

function typewriter(element, text, speed = 35) {
  element.textContent = '';
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  let i = 0;
  const timer = setInterval(() => {
    if (i < text.length) {
      element.textContent += text[i++];
      element.appendChild(cursor);
    } else {
      clearInterval(timer);
    }
  }, speed);
}

window.claudeStatus.onDialogInit(({ sessionId: id }) => {
  sessionId = id;
  const msg = MESSAGES[Math.floor(Math.abs(id.charCodeAt(0)) % MESSAGES.length)];
  typewriter(document.getElementById('message'), msg);
  playFanfare();
});

document.getElementById('btn-keep').addEventListener('click', () => {
  if (sessionId) window.claudeStatus.keepWatching(sessionId);
});

document.getElementById('btn-dismiss').addEventListener('click', () => {
  if (sessionId) window.claudeStatus.dismissSession(sessionId);
});
```

- [ ] **Step 4: Trigger dialog manually to verify appearance**

In `~/.claude-status/sessions.json`, add a session with `status: "waiting"` and `lastUpdate` set to 2+ hours ago:

```json
{
  "version": 1,
  "sessions": {
    "test-stale-session": {
      "status": "waiting",
      "lastUpdate": 1719380000,
      "source": "claude-code",
      "alertedAt": null
    }
  }
}
```

Restart the app (`npm start`). Within 60 seconds the dialog should appear. Verify: typewriter animation, both buttons work, dialog closes and widget updates.

- [ ] **Step 5: Commit**

```bash
git add dialog/
git commit -m "feat: arcade policeman dialog with typewriter animation"
```

---

## Task 10: Distribution & CI

**Files:**
- Modify: `package.json` (electron-builder config already present from Task 1 — verify it)
- Create: `.github/workflows/build.yml`
- Create: `README.md`

**Interfaces:**
- Produces: auto-built `.dmg`, `.exe`, `.AppImage` on git tag push; `README.md` with install instructions

- [ ] **Step 1: Verify electron-builder config in `package.json`**

Confirm the `build` section from Task 1 is still present and correct:

```json
"build": {
  "appId": "com.claudestatuswidget",
  "productName": "Claude Status Widget",
  "files": ["**/*", "!docs", "!tests", "!*.test.js"],
  "mac": {
    "category": "public.app-category.utilities",
    "target": ["dmg", "zip"]
  },
  "win": { "target": ["nsis"] },
  "linux": { "target": ["AppImage"] }
}
```

- [ ] **Step 2: Test local build**

```bash
npm run build:mac
```

Expected: `dist/` contains `Claude Status Widget-0.1.0.dmg` and a `.zip`. Open the `.dmg`, drag app to Applications, launch it — widget should appear and autostart will be registered.

- [ ] **Step 3: Create `.github/workflows/build.yml`**

```yaml
name: Build & Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm test

      - run: npm run build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.os }}
          path: dist/

      - name: Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: dist/**
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Create `README.md`**

```markdown
# Claude Status Widget

> Arcade-style traffic light that shows your Claude Code session status in real time.

🟥 **Red** — Claude is waiting for your input  
🟡 **Yellow** — Claude is processing  
🟢 **Green** — All sessions idle

No more switching windows to check if Claude is done.

## Install

```bash
npm install -g claude-status-widget
claude-status setup
```

Or download a pre-built app from [Releases](../../releases).

## Usage

- Widget appears on your screen as a floating arcade traffic light
- **`Cmd+Shift+S`** — show/hide widget (configurable)
- **Right-click** — mute sounds or quit
- After 1 hour idle in Red — a policeman will ask if you want to keep watching

## Configure

Edit `~/.claude-status/config.json`:

```json
{
  "toggleHotkey": "CommandOrControl+Shift+S",
  "muted": false,
  "windowPosition": { "x": 100, "y": 100 }
}
```

## Uninstall

```bash
claude-status uninstall
```

## Contributing

Issues and PRs welcome. State logic is in `src/` and fully unit tested (`npm test`).
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass across all 4 test files.

- [ ] **Step 6: Final commit**

```bash
git add .github/workflows/build.yml README.md
git commit -m "feat: CI pipeline and README"
```

- [ ] **Step 7: Tag and push to trigger release build**

```bash
git tag v0.1.0
git push origin main --tags
```

Expected: GitHub Actions starts 3 parallel jobs (macOS, Windows, Linux). Check Actions tab. On completion a GitHub Release is created with `.dmg`, `.exe`, and `.AppImage` attached.
```
