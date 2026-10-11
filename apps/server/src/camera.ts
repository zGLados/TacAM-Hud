import fs from 'node:fs';
import path from 'node:path';
import type { CameraShot, CameraState } from '@tacam/shared';
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
    // Order is pitch yaw roll: MirvInput.cpp sets Rx/Ry/Rz from the arguments and builds
    // QEulerAngles(Rx, Ry, Rz) = (pitch, yaw, roll). HLAE's own usage text says
    // <yPitch> <xRoll> <zYaw>, which is wrong and tilted the camera.
    `mirv_input angles ${fmt(view.pitch)} ${fmt(view.yaw)} ${fmt(view.roll)}`,
    `mirv_input fov ${fmt(view.fov)}`,
  ];
}

/** Back to the normal spectator view. */
export const releaseCommands = ['mirv_campath enabled 0', 'mirv_input end'];

type Vec = number[]; // x, y, z, pitch, yaw, roll, fov
const toVec = (v: View): Vec => [v.x, v.y, v.z, v.pitch, v.yaw, v.roll, v.fov];
const toView = ([x, y, z, pitch, yaw, roll, fov]: Vec): View => ({ x, y, z, pitch, yaw, roll, fov });
const mix = (a: Vec, b: Vec, wa: number, wb: number) => a.map((value, i) => value * wa + b[i] * wb);
const distance = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A degree of turning counts like this many units of travel, so pans get time too. */
const UNITS_PER_DEGREE = 5;
const effort = (a: Vec, b: Vec) => distance(a, b) + UNITS_PER_DEGREE * (Math.abs(a[3] - b[3]) + Math.abs(a[4] - b[4]) + Math.abs(a[5] - b[5]));
/** Keyframes per second: dense enough that HLAE's own spline only bridges tiny steps. */
const KEYS_PER_SECOND = 20;

/** Angles as a continuous sequence (each step the shorter way round), so the spline never spins. */
function unwrapAngles(views: View[]): Vec[] {
  const vecs = views.map(toVec);
  for (let i = 1; i < vecs.length; i++) {
    for (const k of [3, 4, 5]) vecs[i][k] = vecs[i - 1][k] + ((((vecs[i][k] - vecs[i - 1][k]) % 360) + 540) % 360) - 180;
  }
  return vecs;
}

/**
 * Centripetal Catmull-Rom (Barry-Goldman) between p1 and p2 at u ∈ [0, 1]: passes through
 * every view without overshooting or looping when the distances between views differ a lot.
 */
function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Vec {
  const knot = (a: Vec, b: Vec) => Math.max(Math.sqrt(distance(a, b)), 1e-3);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + u * (t2 - t1);
  const lerpAt = (a: Vec, b: Vec, ta: number, tb: number) => mix(a, b, (tb - t) / (tb - ta), (t - ta) / (tb - ta));
  const a1 = lerpAt(p0, p1, t0, t1);
  const a2 = lerpAt(p1, p2, t1, t2);
  const a3 = lerpAt(p2, p3, t2, t3);
  return lerpAt(lerpAt(a1, a2, t0, t2), lerpAt(a2, a3, t1, t3), t1, t2);
}

/**
 * Campath XML through the given views in `duration` seconds, starting at time 0
 * (made "now" with `mirv_campath offset current`). TacAM samples the curve itself:
 * a smooth spline through all views, time spread by distance and turning (even
 * speed instead of the same time per view) and a soft start and stop.
 */
export function campathXml(views: View[], duration: number, hold: boolean) {
  if (views.length < 2) throw new CameraError('A camera path needs at least two views');
  const vecs = unwrapAngles(views);
  // Mirrored end points give the first and last segment a natural tangent.
  const padded = [mix(vecs[0], vecs[1], 2, -1), ...vecs, mix(vecs.at(-1)!, vecs.at(-2)!, 2, -1)];
  const at = (segment: number, u: number) => catmullRom(padded[segment], padded[segment + 1], padded[segment + 2], padded[segment + 3], u);

  // Arc-length table over all segments.
  const STEPS = 64;
  const table: { s: number; segment: number; u: number }[] = [{ s: 0, segment: 0, u: 0 }];
  let total = 0;
  for (let segment = 0; segment < vecs.length - 1; segment++) {
    let previous = at(segment, 0);
    for (let step = 1; step <= STEPS; step++) {
      const u = step / STEPS;
      const point = at(segment, u);
      // Identical views: still move through them evenly instead of dividing by zero.
      total += Math.max(effort(previous, point), 1e-6);
      table.push({ s: total, segment, u });
      previous = point;
    }
  }
  const locate = (s: number) => {
    let i = table.findIndex((entry) => entry.s >= s);
    if (i <= 0) return { segment: 0, u: 0 };
    const [a, b] = [table[i - 1], table[i]];
    const f = (s - a.s) / (b.s - a.s);
    return b.segment === a.segment ? { segment: a.segment, u: a.u + (b.u - a.u) * f } : { segment: b.segment, u: b.u * f };
  };

  const count = Math.max(8, Math.ceil(duration * KEYS_PER_SECOND));
  const points: string[] = [];
  for (let k = 0; k <= count; k++) {
    const progress = k / count;
    const eased = (1 - Math.cos(Math.PI * progress)) / 2; // soft start and stop
    const { segment, u } = k === count ? { segment: vecs.length - 2, u: 1 } : locate(eased * total);
    const v = toView(at(segment, u));
    points.push(`    <p t="${fmt(progress * duration)}" x="${fmt(v.x)}" y="${fmt(v.y)}" z="${fmt(v.z)}" fov="${fmt(v.fov)}" rx="${fmt(v.roll)}" ry="${fmt(v.pitch)}" rz="${fmt(v.yaw)}"/>`);
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<campath${hold ? ' hold=""' : ''}>\n  <points>\n${points.join('\n')}\n  </points>\n</campath>\n`;
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

/**
 * HLAE free camera starting at the current game view. HLAE only takes over the
 * game view when camera mode was off for at least one frame (MirvInput.cpp
 * resets m_InputOn only then), so end it first; sendAll waits 300 ms in between.
 * Also resets a FOV that a stuck Page Down / mouse wheel had changed.
 */
export async function freeCamera(console: GameConsole) {
  await console.sendAll(releaseCommands);
  await console.sendAll(['mirv_input camera']);
}

/**
 * Tracks the map from GSI: `onLoad` when a map / demo gets loaded, `onLeave` when
 * CS2 goes back to the main menu. Nothing for the first packet after TacAM starts
 * (a running broadcast keeps its view).
 */
export function mapLoadWatcher(onLoad: () => void, onLeave: () => void = () => {}) {
  let last: string | null | undefined;
  return (map: string | undefined) => {
    const previous = last;
    last = map ?? null;
    if (previous === undefined) return;
    if (map && map !== previous) onLoad();
    else if (!map && previous) onLeave();
  };
}

/** One console command per line; empty lines and `//` comments are skipped. */
export function commandLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'));
}

/**
 * All camera moves go through here, so TacAM knows what CS2 shows: the HUD hides
 * the focused player during a free camera / view / path, and the auto director
 * is switched off by any manual move (as in CS2, where picking a player ends it).
 */
export class CameraControl {
  state: CameraState = { mode: 'game', autoDirector: false };
  private version = 0;

  constructor(
    private console: GameConsole,
    private dataDir: string,
    private onChange: (state: CameraState) => void = () => {}
  ) {}

  private set(patch: Partial<CameraState>) {
    this.version++;
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async goTo(view: View) {
    await this.console.sendAll(['spec_autodirector 0', ...goToCommands(view)]);
    this.set({ mode: 'view', autoDirector: false });
  }

  async playPath(views: View[], duration: number, hold: boolean) {
    await this.console.sendAll(['spec_autodirector 0', ...playPathCommands(this.dataDir, views, duration, hold)]);
    this.set({ mode: 'path', autoDirector: false });
    if (!hold) {
      // Without hold HLAE hands back to the game view at the end of the path.
      const version = this.version;
      setTimeout(() => version === this.version && this.set({ mode: 'game' }), duration * 1000).unref?.();
    }
  }

  async free() {
    await this.console.sendAll(['spec_autodirector 0']);
    await freeCamera(this.console);
    this.set({ mode: 'free', autoDirector: false });
  }

  async release() {
    await this.console.sendAll(releaseCommands);
    this.set({ mode: 'game' });
  }

  async spectate(name: string) {
    await this.console.sendAll(['spec_autodirector 0', ...spectateCommands(name)]);
    this.set({ mode: 'game', autoDirector: false });
  }

  async step(direction: 'next' | 'prev') {
    await this.console.sendAll(['spec_autodirector 0', ...stepCommands(direction)]);
    this.set({ mode: 'game', autoDirector: false });
  }

  /** CS2's own auto director, like in a normal demo / GOTV; ends HLAE camera and path first. */
  async autoDirector(on: boolean) {
    await this.console.sendAll(on ? [...releaseCommands, 'spec_autodirector 1'] : ['spec_autodirector 0']);
    this.set({ mode: 'game', autoDirector: on });
  }
}

