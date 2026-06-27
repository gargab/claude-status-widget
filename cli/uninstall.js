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
    if (process.platform === 'win32') {
      execSync('wmic process where "commandline like \'%claude-status-widget%\'" delete', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "claude-status-widget"', { stdio: 'ignore' });
    }
    console.log('✓ Widget stopped.');
  } catch { /* process not running */ }

  console.log('✓ Uninstall complete.');
}

module.exports = { run, removeHooks };
