const { app, BrowserWindow, globalShortcut, ipcMain, Menu } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
const os = require('os');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const { readState, clearAllSessions, purgeOldSessions } = require('./src/state-manager');
const { computeAggregateStatus } = require('./src/status-aggregator');
const { readConfig, writeConfig } = require('./src/config-manager');

const STATE_FILE = path.join(
  process.env.CLAUDE_STATUS_DIR || path.join(os.homedir(), '.claude-status'),
  'sessions.json'
);

const WIDGET_W = 80;
const WIDGET_H = 220;

let widgetWindow = null;
let watcher = null;
let staleCheckInterval = null;

function createWidgetWindow() {
  const config = readConfig();
  widgetWindow = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_H,
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
  if (process.platform === 'darwin') {
    widgetWindow.setAlwaysOnTop(true, 'screen-saver');
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    widgetWindow.setAlwaysOnTop(true);
  }
  widgetWindow.on('closed', () => { widgetWindow = null; });
  widgetWindow.on('moved', () => {
    const [x, y] = widgetWindow.getPosition();
    writeConfig({ ...readConfig(), windowPosition: { x, y } });
  });
}

function pushStatusUpdate() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const state = readState();
  const status = computeAggregateStatus(state.sessions);
  const config = readConfig();
  widgetWindow.webContents.send('status-update', { status, muted: config.muted });
}

app.whenReady().then(() => {
  purgeOldSessions(20 * 60);

  createWidgetWindow();

  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

  const config = readConfig();
  globalShortcut.register(config.toggleHotkey, () => {
    if (!widgetWindow) return;
    widgetWindow.isVisible() ? widgetWindow.hide() : widgetWindow.show();
  });

  watcher = chokidar.watch(STATE_FILE, { ignoreInitial: false, awaitWriteFinish: false });
  watcher.on('change', pushStatusUpdate);
  watcher.on('add', pushStatusUpdate);

  staleCheckInterval = setInterval(pushStatusUpdate, 60_000);

  ipcMain.on('clear-all', () => {
    clearAllSessions();
    pushStatusUpdate();
  });

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
      { label: 'Refresh', click: () => pushStatusUpdate() },
      {
        label: 'Clear All Sessions',
        click: () => {
          clearAllSessions();
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
  clearInterval(staleCheckInterval);
  globalShortcut.unregisterAll();
  watcher?.close();
});

app.on('window-all-closed', () => {});
