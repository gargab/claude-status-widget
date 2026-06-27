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
