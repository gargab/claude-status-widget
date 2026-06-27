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
