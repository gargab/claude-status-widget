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
