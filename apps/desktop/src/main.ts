import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, globalShortcut, Menu, shell } from 'electron';
import { createTacamServer, type TacamServer } from '@tacam/server';
import type { HudAction } from '@tacam/shared';

/**
 * Desktop wrapper: runs the TacAM server in the main process and shows the
 * control panel in a window. Everything else (HUD, OBS source, LAN control)
 * works through the same HTTP server, so the app is just a convenient shell.
 */

let server: TacamServer | null = null;
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

// Built web apps: next to the app in production, in the monorepo during development.
const webDir = (name: 'hud' | 'control') =>
  app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, '..', '..', name, 'dist');

const baseUrl = () => `http://127.0.0.1:${server?.port ?? 1349}`;

/** Global keybinds, active while the app runs (same defaults as JTs-Hud / TacAM skin). */
const SHORTCUTS: { accelerator: string; action: HudAction['type'] | 'refresh' }[] = [
  { accelerator: 'Alt+V', action: 'radarBigger' },
  { accelerator: 'Alt+B', action: 'radarSmaller' },
  { accelerator: 'Alt+N', action: 'toggleRadarView' },
  { accelerator: 'Alt+O', action: 'toggleHud' },
  { accelerator: 'Alt+F', action: 'refresh' },
];

function registerShortcuts() {
  for (const { accelerator, action } of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      if (!server) return;
      if (action === 'refresh') server.io.emit('refresh');
      else server.io.emit('action', { type: action });
    });
    if (!ok) console.warn(`Shortcut ${accelerator} is already taken`);
  }
}

/** Transparent, click-through HUD window for checking the overlay without OBS. */
function toggleOverlay() {
  if (overlayWindow) {
    overlayWindow.close();
    return;
  }
  overlayWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: { backgroundThrottling: false },
  });
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.loadURL(`${baseUrl()}/hud/`);
  overlayWindow.on('closed', () => (overlayWindow = null));
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'TacAM HUD',
        submenu: [
          { label: 'HUD-URL kopieren (OBS)', click: () => clipboard.writeText(`${baseUrl()}/hud/`) },
          { label: 'HUD im Browser öffnen', click: () => shell.openExternal(`${baseUrl()}/hud/`) },
          { label: 'HUD-Overlay-Fenster ein/aus', accelerator: 'Alt+H', click: toggleOverlay },
          { type: 'separator' },
          { label: 'Datenordner öffnen', click: () => shell.openPath(app.getPath('userData')) },
          { type: 'separator' },
          { role: 'quit', label: 'Beenden' },
        ],
      },
      {
        label: 'Ansicht',
        submenu: [{ role: 'reload', label: 'Neu laden' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
      },
    ])
  );
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#16181c',
    title: 'TacAM HUD Manager',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Links to other origins (docs, GitHub) open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await mainWindow.loadURL(`${baseUrl()}/control/`);
  mainWindow.on('closed', () => (mainWindow = null));
}

async function start() {
  server = createTacamServer({
    dataDir: app.getPath('userData'),
    hudDir: webDir('hud'),
    controlDir: webDir('control'),
  });
  try {
    await server.start();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    dialog.showErrorBox(
      'TacAM HUD konnte nicht starten',
      err.code === 'EADDRINUSE'
        ? 'Port 1349 oder 23415 ist bereits belegt. Läuft TacAM HUD oder JTs-Hud schon?'
        : String(err.message ?? err)
    );
    app.quit();
    return;
  }
  buildMenu();
  registerShortcuts();
  await createMainWindow();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(start);
  app.on('activate', () => {
    if (!mainWindow && server) void createMainWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('before-quit', (event) => {
    if (!server) return;
    event.preventDefault();
    const running = server;
    server = null;
    running.stop().finally(() => app.quit());
  });
}
