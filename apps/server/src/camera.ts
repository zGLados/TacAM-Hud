import fs from 'node:fs';
import path from 'node:path';
import type { CameraShot } from '@tacam/shared';
import type { GameConsole } from './game.js';

/**
 * Camera control through HLAE (needs CS2 started via HLAE, see game.ts):
 * - views: `mirv_input camera` + `position` / `angles` / `fov`
 * - paths: a campath XML written by TacAM, loaded with `mirv_campath load`
 *   and started now with `mirv_campath offset current`.
 * Commands verified against advancedfx/shared/MirvInput.cpp and MirvCampath.cpp.
 */

export type View = Omit<CameraShot, 'id' | 'name' | 'map'>;

export class CameraError extends Error {}

/** HLAE answers `mirv_input` without options with its usage text; plain CS2 says "Unknown command". */
export async function hlaeActive(console: GameConsole): Promise<boolean> {
  const lines = await console.send('mirv_input', 500);
  return lines.some((l) => /mirv_input camera/i.test(l));
}

const NUM = '(-?[\\d.]+(?:e[-+]?\\d+)?)';
// `mirv_campath print` ends with: Current ( x y z ) fov ( pitch yaw roll ): ( 1.0  2.0  3.0 ) 90.0 ( 4.0  5.0  6.0 )
const CURRENT_VIEW = new RegExp(`Current \\( x y z \\) fov \\( pitch yaw roll \\): \\(\\s*${NUM}\\s+${NUM}\\s+${NUM}\\s*\\)\\s*${NUM}\\s*\\(\\s*${NUM}\\s+${NUM}\\s+${NUM}\\s*\\)`, 'i');

export function parseCurrentView(lines: string[]): View | null {
  for (const line of lines) {
    const m = line.match(CURRENT_VIEW);
    if (m) {
      const [x, y, z, fov, pitch, yaw, roll] = m.slice(1).map(Number);
      return { x, y, z, fov, pitch, yaw, roll };
    }
  }
  return null;
}

/** The view CS2 currently renders (also while spectating a player). */
export async function readView(console: GameConsole): Promise<View> {
  const view = parseCurrentView(await console.send('mirv_campath print', 700));
  if (!view) throw new CameraError('No answer from HLAE – is CS2 running via HLAE (Settings → launch mode) and the console connected?');
  return view;
}

const fmt = (n: number) => Number(n.toFixed(3)).toString();

/** Jumps to a view and keeps it (HLAE camera input mode). */
export function goToCommands(view: View) {
  return [
    'mirv_campath enabled 0',
    'mirv_input camera',
    `mirv_input position ${fmt(view.x)} ${fmt(view.y)} ${fmt(view.z)}`,
    // mirv_input angles takes <pitch> <roll> <yaw>
    `mirv_input angles ${fmt(view.pitch)} ${fmt(view.roll)} ${fmt(view.yaw)}`,
    `mirv_input fov ${fmt(view.fov)}`,
  ];
}

/** Back to the normal spectator view. */
export const releaseCommands = ['mirv_campath enabled 0', 'mirv_input end'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Angle interpolation along the shorter way round. */
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

function between(a: View, b: View, t: number): View {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    pitch: lerpAngle(a.pitch, b.pitch, t),
    yaw: lerpAngle(a.yaw, b.yaw, t),
    roll: lerpAngle(a.roll, b.roll, t),
    fov: lerp(a.fov, b.fov, t),
  };
}

/**
 * Campath XML through the given views in `duration` seconds, starting at time 0
 * (made "now" with `mirv_campath offset current`). HLAE needs at least four
 * keyframes, so short paths get points on the straight line in between.
 */
export function campathXml(views: View[], duration: number, hold: boolean) {
  if (views.length < 2) throw new CameraError('A camera path needs at least two views');
  // Two views: thirds keep the speed even; otherwise split the longest segment until there are four keys.
  const base = views.length === 2 ? [views[0], between(views[0], views[1], 1 / 3), between(views[0], views[1], 2 / 3), views[1]] : views;
  const keys = base.map((view, i) => ({ t: (duration * i) / (base.length - 1), view }));
  while (keys.length < 4) {
    let longest = 0;
    for (let i = 1; i < keys.length - 1; i++) if (keys[i + 1].t - keys[i].t > keys[longest + 1].t - keys[longest].t) longest = i;
    const a = keys[longest];
    const b = keys[longest + 1];
    keys.splice(longest + 1, 0, { t: (a.t + b.t) / 2, view: between(a.view, b.view, 0.5) });
  }
  const points = keys
    .map(({ t, view: v }) => `    <p t="${fmt(t)}" x="${fmt(v.x)}" y="${fmt(v.y)}" z="${fmt(v.z)}" fov="${fmt(v.fov)}" rx="${fmt(v.roll)}" ry="${fmt(v.pitch)}" rz="${fmt(v.yaw)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<campath${hold ? ' hold=""' : ''}>\n  <points>\n${points}\n  </points>\n</campath>\n`;
}

/** Writes the path file and returns the console commands that play it from now. */
export function playPathCommands(dataDir: string, views: View[], duration: number, hold: boolean) {
  const dir = path.join(dataDir, 'campaths');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'tacam-path.xml');
  fs.writeFileSync(file, campathXml(views, duration, hold));
  return [
    // camera input mode would override the path
    'mirv_input end',
    'mirv_campath enabled 0',
    'mirv_campath clear',
    `mirv_campath load "${file}"`,
    `mirv_campath hold ${hold ? 1 : 0}`,
    'mirv_campath offset current',
    'mirv_campath enabled 1',
  ];
}

/**
 * Follow one player in first person: leave HLAE camera/path first (they would
 * cover the switch), then `spec_player <name>` + `spec_mode 1` – the same pair
 * JTs-Hud's spectator binds use; `spec_player` alone only sets the target.
 * Names come from the GSI data. CS2 cannot target names starting with a digit.
 */
export function spectateCommands(name: string) {
  const clean = name.replace(/["\r\n;]/g, '');
  if (!clean.trim()) throw new CameraError('Player name is empty');
  return [...releaseCommands, `spec_player "${clean}"`, 'spec_mode 1'];
}

/** Next / previous player, works for any name. */
export function stepCommands(direction: 'next' | 'prev') {
  return [...releaseCommands, direction === 'next' ? 'spec_next' : 'spec_prev', 'spec_mode 1'];
}
