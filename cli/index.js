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
