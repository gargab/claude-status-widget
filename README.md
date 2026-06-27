<div align="center">

# 🚦 Claude Status Widget

**A floating arcade traffic light for your desktop that shows what Claude Code is doing — without switching windows.**

**Tracks all your Claude Code sessions in one place** — terminal CLI instances and the Claude Code desktop/web app simultaneously.

<p>
<img src="https://img.shields.io/badge/version-0.1.0-FF6B35?style=for-the-badge" alt="Version">
<a href="https://github.com/gargab/claude-status-widget/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-8B5CF6?style=for-the-badge" alt="License"></a>
<img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-black?style=for-the-badge" alt="Platform">
<img src="https://img.shields.io/badge/built%20with-Electron-47848F?style=for-the-badge&logo=electron" alt="Electron">
</p>

<p>
<a href="#-install"><kbd> &nbsp; ⚡ Install &nbsp; </kbd></a>
<a href="#-how-it-works"><kbd> &nbsp; 🔧 How it works &nbsp; </kbd></a>
<a href="#-usage"><kbd> &nbsp; 🖱️ Usage &nbsp; </kbd></a>
</p>

</div>

---

## 💡 Why this exists

You kick off a long Claude Code task and switch to other work. You have no idea if it's still running, waiting for your input, or crashed — without alt-tabbing back to check.

**Claude Status Widget sits in the corner of your screen and tells you exactly what's happening across all your Claude Code sessions in real time.**

- 🟢 **Green** — Claude is done. Come back whenever.
- 🟡 **Yellow** — Claude is actively processing. Stay focused on what you're doing.
- 🔴 **Red** — A session has been stuck or idle for 20+ minutes. Something needs your attention.

It works across all macOS spaces and full-screen apps. Always visible. Zero noise.

---

## ⚡ Install

### Prerequisites

**1. Node.js 18+**

```bash
# macOS (Homebrew)
brew install node

# Windows (winget)
winget install OpenJS.NodeJS

# Or download from https://nodejs.org
```

Verify: `node --version` should print `v18` or higher.

**2. Claude Code CLI**

```bash
npm install -g @anthropic-ai/claude-code
```

Verify: `claude --version` should print a version number.

---

### Option A — Let Claude do it

Paste this into any Claude Code session and it will run the setup for you:

```
Please set up the Claude Status Widget on my machine by running:
  git clone https://github.com/gargab/claude-status-widget
  cd claude-status-widget && npm install && npm link
  claude-status setup
Then confirm it worked.
```

---

### Option B — Manual

```bash
git clone https://github.com/gargab/claude-status-widget
cd claude-status-widget
npm install
npm link                  # registers claude-status globally
claude-status setup       # installs hooks + launches widget
```

`setup` registers Claude Code lifecycle hooks that write session state to `~/.claude-status/sessions.json`. The widget reads that file in real time.

---

## 🔧 How it works

Claude Code supports lifecycle hooks — shell scripts that fire on session events. This widget installs four hooks:

| Hook | What it signals |
|---|---|
| `UserPromptSubmit` | You sent a message → session is active |
| `PreToolUse` / `PostToolUse` | Claude is running a tool → still processing |
| `Stop` | Claude finished responding → session idle |

Each hook writes a tiny JSON update to `~/.claude-status/sessions.json`. The widget watches that file with `chokidar` and recomputes the aggregate status across all sessions instantly.

**Aggregate rules:**

| Condition | Color |
|---|---|
| Any session processing (updated < 20 min ago) | 🟡 Yellow |
| Any session stuck/idle for 20+ min | 🔴 Red |
| All sessions idle or done | 🟢 Green |

On startup, sessions older than 20 minutes are automatically purged so yesterday's crashed terminals don't haunt you.

---

## 🖱️ Usage

The widget floats above all windows and follows you across every macOS Space and full-screen app.

### Keyboard shortcut

| Shortcut | What it does |
|---|---|
| `Cmd+Shift+S` | Show / hide the widget (configurable in `~/.claude-status/config.json`) |

### Right-click menu

| Option | What it does |
|---|---|
| **Mute / Unmute** | Toggle the sound effects that play when the light changes colour |
| **Refresh** | Manually force the widget to re-read session state — useful if you think it's out of sync |
| **Clear All Sessions** | Wipe all tracked sessions and reset the light to Green immediately |
| **Quit** | Close the widget |

> **Tip:** If a session gets stuck on Red after a crash or a killed terminal, right-click → **Clear All Sessions** to reset.

---

## ⚙️ Configure

Edit `~/.claude-status/config.json` to customise:

```json
{
  "toggleHotkey": "CommandOrControl+Shift+S",
  "muted": false,
  "windowPosition": { "x": 100, "y": 100 }
}
```

The widget writes `windowPosition` back automatically when you drag it around.

---

## 🗑️ Uninstall

```bash
claude-status uninstall
```

Removes hooks from `~/.claude/settings.json` and clears `~/.claude-status/`.

---

## 🏗️ Architecture

```
claude-status-widget/
├── main.js              # Electron main — window management, file watcher, IPC
├── preload.js           # Context bridge — safe renderer ↔ main channel
├── renderer/            # Widget UI — traffic light, sounds, context menu
├── hook/                # Hook runner — reads Claude Code event, writes state
├── cli/                 # CLI — setup, uninstall, global binary
└── src/
    ├── state-manager.js      # Read/write ~/.claude-status/sessions.json
    ├── status-aggregator.js  # Pure logic: sessions → red/yellow/green
    └── config-manager.js     # Read/write ~/.claude-status/config.json
```

Status logic is pure and fully unit tested:

```bash
npm test   # 23 tests, zero dependencies on Electron
```

---

## 🗺️ Roadmap

| Feature | Status |
|---|---|
| Claude Code CLI sessions (terminal) | ✅ Shipped |
| Claude Code desktop / web app sessions | ✅ Shipped |
| **Claude.ai chat session tracking** | 🔜 Planned |

> Claude.ai chat sessions (claude.ai in the browser) don't expose lifecycle hooks today. Tracking support will land once a reliable signal is available.

---

## 🤝 Contributing

Issues and PRs welcome. The interesting logic lives in [`src/status-aggregator.js`](src/status-aggregator.js) — all colour decisions go through one pure function, easy to reason about and test.

```bash
git clone https://github.com/gargab/claude-status-widget
cd claude-status-widget
npm install
npm start        # run the widget locally
npm test         # run the test suite
```
