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
