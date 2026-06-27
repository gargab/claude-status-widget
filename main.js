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
