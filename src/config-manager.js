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
