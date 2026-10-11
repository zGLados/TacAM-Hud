import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { unzipSync } from 'fflate';

/**
 * Imported HUDs (LHM / JTs-Hud style): a zip with `hud.json` at its root (or in
 * a single top-level folder), extracted to `<dataDir>/huds/<dir>/` and served
 * at `/huds/<dir>/`. The data interface they expect is emulated in lhm.ts.
 */

export interface HudManifest {
  name: string;
  version?: string;
  author?: string;
  game?: string;
  radar?: boolean;
  killfeed?: boolean;
}

export interface ImportedHud {
  dir: string;
  name: string;
  version: string;
  author: string;
  /** Thumbnail path relative to the HUD folder, if the HUD ships one. */
  thumb: string | null;
  hasPanel: boolean;
  hasKeybinds: boolean;
}

const MAX_FILES = 3000;
const MAX_TOTAL = 300 * 1024 * 1024;

export class HudImportError extends Error {}

export function hudsDir(dataDir: string) {
  return path.join(dataDir, 'huds');
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function describe(root: string, dir: string): ImportedHud | null {
  const folder = path.join(root, dir);
  const manifest = readJson<HudManifest>(path.join(folder, 'hud.json'));
  if (!manifest?.name) return null;
  const thumb = ['thumb.png', 'icon.png', 'preview.png'].find((f) => fs.existsSync(path.join(folder, f))) ?? null;
  return {
    dir,
    name: String(manifest.name),
    version: String(manifest.version ?? ''),
    author: String(manifest.author ?? ''),
    thumb,
    hasPanel: fs.existsSync(path.join(folder, 'panel.json')),
    hasKeybinds: fs.existsSync(path.join(folder, 'keybinds.json')),
  };
}

export function listHuds(dataDir: string): ImportedHud[] {
  const root = hudsDir(dataDir);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => describe(root, e.name))
    .filter((h): h is ImportedHud => !!h)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getHud(dataDir: string, dir: string) {
  if (!/^[a-z0-9-]+$/.test(dir)) return null;
  return describe(hudsDir(dataDir), dir);
}

export function hudFile<T>(dataDir: string, dir: string, file: 'panel.json' | 'keybinds.json'): T | null {
  if (!getHud(dataDir, dir)) return null;
  return readJson<T>(path.join(hudsDir(dataDir), dir, file));
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'hud';

/** Extracts a HUD zip safely (no paths outside the target, size limits) and returns the new HUD. */
export function importHudZip(dataDir: string, zip: Uint8Array): ImportedHud {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new HudImportError('Not a valid zip file');
  }
  const files = Object.entries(entries).filter(([name]) => !name.endsWith('/') && !name.startsWith('__MACOSX/'));
  if (files.length > MAX_FILES) throw new HudImportError('Too many files in the zip');
  if (files.reduce((sum, [, data]) => sum + data.length, 0) > MAX_TOTAL) throw new HudImportError('The HUD is too large (max. 300 MB unpacked)');

  // hud.json at the root, or inside one top-level folder (zips made by "compress folder").
  const manifestEntry = files.map(([name]) => name).filter((n) => n.split('/').pop() === 'hud.json').sort((a, b) => a.length - b.length)[0];
  if (!manifestEntry) throw new HudImportError('hud.json not found – is this an LHM/JTs-Hud compatible HUD?');
  const prefix = manifestEntry.slice(0, -'hud.json'.length);
  if (prefix.split('/').length > 2) throw new HudImportError('hud.json must be at the root of the zip');
  let manifest: HudManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(entries[manifestEntry]));
  } catch {
    throw new HudImportError('hud.json is not valid JSON');
  }
  if (!manifest?.name || typeof manifest.name !== 'string') throw new HudImportError('hud.json has no name');
  if (manifest.game && manifest.game !== 'cs2' && manifest.game !== 'csgo') throw new HudImportError(`This HUD is for ${manifest.game}, not CS2`);

  const root = hudsDir(dataDir);
  const dir = `${slug(manifest.name)}-${randomBytes(3).toString('hex')}`;
  const target = path.join(root, dir);
  const tmp = `${target}.tmp`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const [name, data] of files) {
      if (!name.startsWith(prefix)) continue;
      const relative = name.slice(prefix.length);
      const out = path.resolve(tmp, relative);
      // Zip slip: never write outside the HUD folder.
      if (!out.startsWith(tmp + path.sep)) throw new HudImportError(`Invalid path in zip: ${name}`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
    }
    if (!fs.existsSync(path.join(tmp, 'index.html'))) throw new HudImportError('index.html not found next to hud.json');
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
  return describe(root, dir)!;
}

export function removeHud(dataDir: string, dir: string) {
  if (!getHud(dataDir, dir)) return false;
  fs.rmSync(path.join(hudsDir(dataDir), dir), { recursive: true, force: true });
  return true;
}

/** Valid folder name of an imported HUD. */
export const isHudDir = (dir: string) => /^[a-z0-9-]{1,60}$/.test(dir);

/** All files of an imported HUD as [path relative to its folder, content] (settings export). */
export function readHudFiles(dataDir: string, dir: string): [string, Uint8Array][] {
  if (!getHud(dataDir, dir)) return [];
  const folder = path.join(hudsDir(dataDir), dir);
  const out: [string, Uint8Array][] = [];
  const walk = (relative: string) => {
    for (const entry of fs.readdirSync(path.join(folder, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) out.push([name, fs.readFileSync(path.join(folder, name))]);
    }
  };
  walk('');
  return out;
}

/** Writes an imported HUD folder from a settings export, replacing an existing one with the same name. */
export function writeHudFiles(dataDir: string, dir: string, files: [string, Uint8Array][]) {
  if (!isHudDir(dir)) throw new HudImportError(`Invalid HUD folder: ${dir}`);
  if (files.length > MAX_FILES || files.reduce((sum, [, data]) => sum + data.length, 0) > MAX_TOTAL) throw new HudImportError(`HUD ${dir} is too large`);
  const names = new Set(files.map(([name]) => name));
  if (!names.has('hud.json') || !names.has('index.html')) throw new HudImportError(`HUD ${dir} has no hud.json / index.html`);
  const target = path.join(hudsDir(dataDir), dir);
  const tmp = `${target}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const [name, data] of files) {
      const out = path.resolve(tmp, name);
      if (!out.startsWith(tmp + path.sep)) throw new HudImportError(`Invalid path in HUD ${dir}: ${name}`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}
