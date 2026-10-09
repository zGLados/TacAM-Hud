import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Data directory used when running standalone (Electron passes its own userData path). */
export function defaultDataDir() {
  return process.env.TACAM_DATA_DIR ?? path.join(os.homedir(), '.tacam-hud');
}

/**
 * apps/ directory of the monorepo, resolved from src/ or dist/. Only used by the
 * standalone entry point; evaluated lazily because import.meta.url does not
 * exist when the server is bundled into Electron's CommonJS main process.
 */
export function appsDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}
