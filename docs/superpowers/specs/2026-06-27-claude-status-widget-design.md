# Claude Status Widget — Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Author:** abhingarg@expediagroup.com

---

## Problem

When Claude is processing or waiting for input across multiple sessions, users must context-switch manually to check status. This causes forgotten threads, wasted time, and broken focus.

## Solution

A floating always-on-top arcade-style traffic light widget for macOS/Windows/Linux. Shows aggregate status of all active Claude Code sessions at a glance — no context switching required.

---

## Goals

- Zero-friction status awareness across all active Claude Code sessions
- Globally distributable open-source tool (npm, brew, GitHub Releases)
- Extensible architecture: Claude Code first, browser extension (claude.ai) later
- Arcade aesthetic: neon glow, CRT scanlines, chiptune sounds

---

## Non-Goals

- v1 does not monitor claude.ai web sessions (browser extension = v2)
- Not a full session manager — read-only status, no interaction with Claude
- No cloud sync — local file-based state only

---

## Architecture

Three layers, cleanly separated:

```
Claude Code hooks  →  State file  →  Electron widget
  (producers)        (shared bus)     (renderer)
```

### Layer 1 — Hooks (producers)

Claude Code fires lifecycle hooks on every state transition. A CLI binary (`claude-status-hook`) is registered as the hook handler. It receives the hook payload via stdin as JSON, extracts the session ID, and atomically updates the shared state file.

Hook bindings in `~/.claude/settings.json`:

| Hook event | Status written |
|---|---|
| `UserPromptSubmit` | `processing` |
| `PreToolUse` | `processing` |
| `PostToolUse` | `processing` |
| `Stop` | `waiting` |
| `SubagentStop` | `processing` |

### Layer 2 — State file (shared bus)

**Path:** `~/.claude-status/sessions.json`

```json
{
  "version": 1,
  "sessions": {
    "<session_id>": {
      "status": "waiting",
      "lastUpdate": 1719456000,
      "source": "claude-code",
      "alertedAt": null
    }
  }
}
```

**Fields:**
- `status`: `"processing"` | `"waiting"` | `"idle"`
- `lastUpdate`: Unix timestamp — used for 1hr arcade dialog trigger
- `source`: `"claude-code"` (v1) | `"claude-web"` (v2 browser extension)
- `alertedAt`: timestamp when policeman dialog was last shown — prevents repeat popups

**Write strategy:** atomic (write to `.tmp` → rename) so the watcher never reads a partial file.

**Extensibility:** the `source` field means a v2 browser extension can write to the same file with `"claude-web"` entries. The widget aggregates all sources identically.

### Layer 3 — Electron widget (renderer)

Main process watches the state file with `chokidar`. On every change it computes aggregate status and sends it to the renderer via IPC.

---

## State Machine

### Per-session

```
idle ──UserPromptSubmit──▶ processing ──Stop──▶ waiting
  ▲                            ▲                  │
  │         PreToolUse/        │                  │ >1hr → arcade dialog
  │         PostToolUse ───────┘                  │ "Dismiss" 
  └───────────────────────────────────────────────┘
```

### Aggregate (precedence: Red > Yellow > Green)

| Condition | Aggregate state |
|---|---|
| Any session = `waiting` | RED |
| No red, any = `processing` | YELLOW |
| All `idle` or no sessions | GREEN |

### Session expiry

When a session has been in `waiting` state for >1 hour with no update, the widget spawns an arcade policeman dialog rather than silently expiring. The user explicitly chooses:

- **KEEP WATCHING** — sets `alertedAt` to now; 1hr countdown restarts from this timestamp
- **DISMISS IT** — sets session to `idle`, aggregate recalculates

This prevents phantom Red states from dead/forgotten sessions while keeping the user in control.

---

## Project Structure

```
claude-status-widget/
├── package.json
├── main.js                 # Main process: window, file watcher, IPC, dialog timer
├── preload.js              # Context bridge (main ↔ renderer)
├── renderer/
│   ├── index.html          # Traffic light widget
│   ├── widget.css          # Arcade neon styles, CRT scanlines
│   └── widget.js           # IPC listener, DOM updates, mute toggle
├── dialog/
│   ├── dialog.html         # Policeman alert overlay
│   └── dialog.js           # "Keep watching" / "Dismiss" logic
├── hook/
│   └── index.js            # CLI: reads stdin JSON, writes sessions.json atomically
└── cli/
    └── setup.js            # Auto-injects hooks into ~/.claude/settings.json
```

---

## Visual Design

### Widget window (80×220px)

- Frameless, transparent background, always-on-top
- Near-black translucent panel: `rgba(10,10,10,0.92)`, `border-radius: 16px`
- Three circles stacked vertically (real traffic light layout)
- **Inactive circles:** `#1a1a1a` (dim, unlit)
- **Active RED:** `#ff2020` + `box-shadow: 0 0 20px 8px #ff2020`
- **Active YELLOW:** `#ffd700` + `box-shadow: 0 0 20px 8px #ffd700`
- **Active GREEN:** `#00ff44` + `box-shadow: 0 0 20px 8px #00ff44`
- Subtle CRT scanline overlay: CSS `repeating-linear-gradient`, 5% opacity
- Entire widget is draggable via `-webkit-app-region: drag`
- **Right-click** on widget opens a minimal context menu: `[Mute / Unmute]` `[Quit]`
- Muted state: widget dims to 40% opacity; small `🔇` indicator appears bottom-center
- Window position persisted to disk, restored on relaunch

### Policeman dialog window (~400×300px)

- Same dark arcade panel aesthetic as widget
- Pixel-art policeman sprite on left
- Retro dialog box on right with typewriter text animation
- Playful copy, e.g.: *"HEY ROOKIE! This session's been waiting on you for an HOUR! You ghostin' it or what?"*
- Two arcade-button styled CTAs: `[ KEEP WATCHING ]` `[ DISMISS IT ]`
- Chiptune sound effect on appear (skipped if muted)

---

## Sound Design

- State change to RED: alert chime (short, attention-grabbing)
- State change to GREEN: success chime (satisfying, brief)
- Policeman dialog appear: chiptune fanfare
- All sounds suppressed when muted

---

## Install & Distribution

### Primary (npm global)

```bash
npm install -g claude-status-widget
claude-status setup
```

`setup` command:
1. Creates `~/.claude-status/` directory
2. Reads `~/.claude/settings.json`, merges hook entries non-destructively
3. Registers autostart (launchd plist on macOS, startup entry on Windows/Linux)
4. Launches widget as background process

### Secondary channels (GitHub Actions CI)

- `brew install claude-status-widget` via a Homebrew tap
- GitHub Releases: `.dmg` (macOS), `.exe` installer (Windows), `.AppImage` (Linux) — built with `electron-builder`

### Uninstall

```bash
claude-status uninstall  # removes hooks, removes autostart entry, quits widget
```

---

## v2 Extension Point (browser extension)

The `source` field in `sessions.json` is the only interface contract needed. A browser extension for claude.ai:
1. Detects Claude processing/waiting state from DOM
2. Writes `{ status, lastUpdate, source: "claude-web" }` to `sessions.json` via a native messaging host
3. Widget aggregates `claude-web` sessions identically to `claude-code` sessions

No changes needed to the widget or state machine for v2.

---

## Open Questions / Future

- Pixel-art policeman sprite: commission or generate via AI image tool
- Chiptune sound assets: source from open-license chiptune library
- Windows autostart mechanism: confirm best practice (registry vs startup folder)
- npm package name availability: check `claude-status-widget` before publishing
