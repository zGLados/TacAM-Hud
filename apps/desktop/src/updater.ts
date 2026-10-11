import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Update check against GitHub Releases (latest.yml attached by the release
 * workflow). Only the installer replaces the program files; the database and
 * uploads live in userData, so they survive every update.
 */

// Downloads only after the user agreed, installs only after a second confirmation.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let busy = false;

const parent = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

async function showMessage(options: Electron.MessageBoxOptions) {
  const win = parent();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

/** The portable build and dev runs cannot update themselves. */
export function updatesSupported() {
  return app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR;
}

/**
 * `manual` reports "up to date" and errors; the startup check stays silent unless there is an update.
 * `beta` (Settings → App updates) also offers GitHub pre-releases (v1.2.3-beta.1, channel file beta.yml).
 */
export async function checkForUpdates(manual = false, beta = false) {
  if (busy) return;
  if (!updatesSupported()) {
    if (manual) await showMessage({ type: 'info', message: 'Updates are only available in the installed Windows version.' });
    return;
  }
  busy = true;
  autoUpdater.allowPrerelease = beta;
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo.version;
    if (!result?.isUpdateAvailable || !latest) {
      if (manual) await showMessage({ type: 'info', message: `TacAM HUD ${app.getVersion()} is up to date.` });
      return;
    }
    const { response } = await showMessage({
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `TacAM HUD ${latest} is available`,
      detail: `You are using ${app.getVersion()}. The update keeps all teams, players, matches, uploads and settings.`,
    });
    if (response !== 0) return;
    await autoUpdater.downloadUpdate();
    const install = await showMessage({
      type: 'info',
      buttons: ['Restart and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `TacAM HUD ${latest} is ready to install`,
      detail: 'The app closes, installs the update and starts again. Choosing "Later" installs it when you quit the app.',
    });
    if (install.response === 0) autoUpdater.quitAndInstall(true, true);
    else autoUpdater.autoInstallOnAppQuit = true;
  } catch (error) {
    // Offline or GitHub unreachable: no reason to bother anyone at startup.
    if (manual) await showMessage({ type: 'error', message: 'Update check failed', detail: String((error as Error).message ?? error) });
    else console.warn('Update check failed:', error);
  } finally {
    busy = false;
  }
}
