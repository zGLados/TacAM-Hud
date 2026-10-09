import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GSI_CFG_NAME = 'gamestate_integration_tacam.cfg';
const CS2_CFG_RELATIVE = path.join('steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'cfg');

export function gsiConfig(port: number, token: string) {
  return `"TacAM HUD"
{
  "uri" "http://127.0.0.1:${port}/"
  "timeout" "0.1"
  "buffer" "0"
  "throttle" "0"
  "heartbeat" "0.5"
  "auth"
  {
    "token" "${token}"
  }
  "data"
  {
    "provider" "1"
    "map" "1"
    "round" "1"
    "player_id" "1"
    "player_state" "1"
    "player_position" "1"
    "allplayers_id" "1"
    "allplayers_state" "1"
    "allplayers_match_stats" "1"
    "allplayers_weapons" "1"
    "allplayers_position" "1"
    "phase_countdowns" "1"
    "allgrenades" "1"
    "map_round_wins" "1"
    "bomb" "1"
  }
}
`;
}

export function defaultSteamPaths(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  }
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Steam')];
  }
  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ];
}

/** Reads all Steam library folders from libraryfolders.vdf (plus the Steam root itself). */
export function steamLibraries(steamPath: string): string[] {
  const libraries = new Set<string>([steamPath]);
  const vdf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (fs.existsSync(vdf)) {
    const content = fs.readFileSync(vdf, 'utf8');
    for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.add(match[1].replace(/\\\\/g, '\\'));
    }
  }
  return [...libraries];
}

export function findCs2CfgDir(steamPath: string | null): string | null {
  const roots = steamPath ? [steamPath] : defaultSteamPaths();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const library of steamLibraries(root)) {
      const dir = path.join(library, CS2_CFG_RELATIVE);
      if (fs.existsSync(dir)) return dir;
    }
  }
  return null;
}

export function installGsiConfig(steamPath: string | null, port: number, token: string) {
  const dir = findCs2CfgDir(steamPath);
  if (!dir) {
    throw new Error('CS2 wurde nicht gefunden. Bitte den Steam-Ordner in den Einstellungen setzen.');
  }
  const file = path.join(dir, GSI_CFG_NAME);
  fs.writeFileSync(file, gsiConfig(port, token));
  return file;
}

export function gsiConfigInstalled(steamPath: string | null) {
  const dir = findCs2CfgDir(steamPath);
  return !!dir && fs.existsSync(path.join(dir, GSI_CFG_NAME));
}
