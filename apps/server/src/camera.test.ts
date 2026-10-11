import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CameraState } from '@tacam/shared';
import { CameraControl, campathXml, commandLines, goToCommands, hlaeActive, mapLoadWatcher, parseCurrentView, playPathCommands, readView, spectateCommands, stepCommands } from './camera.js';
import { GameConsole } from './game.js';

// Output formats as printed by advancedfx/shared/MirvInput.cpp and MirvCampath.cpp.
const HLAE_USAGE = ['Usage:', 'mirv_input camera - Enable camera input mode, see HLAE manual for keybinds etc.', 'mirv_input end - End input mode(s).'];
const CAMPATH_PRINT = [
  'passed? selected? id : tick[offset](approximate!) , demoTime[offset](approximate!) , gameTime[offset] -> ( x y z ) fov ( pitch yaw roll )',
  '----',
  'Current tick: n/a, Current demoTime: n/a, Current gameTime: 512.250000',
  'Current ( x y z ) fov ( pitch yaw roll ): ( -1247.950000  -640.560000  -103.970000 ) 90.000000 ( 9.800000  -15.270000  0.000000 )',
];

const servers: net.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function fakeCs2(hlae: boolean, received: string[] = []) {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.on('data', (data: string) => {
      for (const line of data.split('\n').filter(Boolean)) {
        received.push(line);
        if (!hlae && line.startsWith('mirv_')) socket.write(`Unknown command "${line.split(' ')[0]}"\n`);
        else if (line === 'mirv_input') socket.write(HLAE_USAGE.join('\n') + '\n');
        else if (line === 'mirv_campath print') socket.write(CAMPATH_PRINT.join('\n') + '\n');
      }
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return new GameConsole(() => ({ host: '127.0.0.1', port: (server.address() as net.AddressInfo).port }));
}

describe('camera (HLAE)', () => {
  it('detects whether CS2 runs with HLAE', async () => {
    expect(await hlaeActive(await fakeCs2(true))).toBe(true);
    expect(await hlaeActive(await fakeCs2(false))).toBe(false);
  });

  it('reads the current view from mirv_campath print', async () => {
    expect(parseCurrentView(CAMPATH_PRINT)).toEqual({ x: -1247.95, y: -640.56, z: -103.97, fov: 90, pitch: 9.8, yaw: -15.27, roll: 0 });
    expect(await readView(await fakeCs2(true))).toMatchObject({ x: -1247.95, pitch: 9.8 });
    await expect(readView(await fakeCs2(false))).rejects.toThrow('via HLAE');
  });

  it('jumps to a view with mirv_input (angles as pitch yaw roll, despite the HLAE usage text)', () => {
    expect(goToCommands({ x: 1, y: 2.5, z: -3, pitch: 10, yaw: 90, roll: 0, fov: 75 })).toEqual([
      'mirv_campath enabled 0',
      'mirv_input camera',
      'mirv_input position 1 2.5 -3',
      'mirv_input angles 10 90 0',
      'mirv_input fov 75',
    ]);
  });

  const pathPoints = (xml: string) =>
    [...xml.matchAll(/<p t="([-\d.]+)" x="([-\d.]+)" y="([-\d.]+)" z="([-\d.]+)" fov="([-\d.]+)" rx="([-\d.]+)" ry="([-\d.]+)" rz="([-\d.]+)"/g)].map((m) => {
      const [t, x, y, z, fov, roll, pitch, yaw] = m.slice(1).map(Number);
      return { t, x, y, z, fov, roll, pitch, yaw };
    });

  it('builds a dense, smooth campath with HLAE angle attributes', () => {
    const a = { x: 0, y: 0, z: 0, pitch: 0, yaw: 170, roll: 0, fov: 90 };
    const b = { x: 100, y: 0, z: 50, pitch: 20, yaw: -170, roll: 0, fov: 70 };
    const xml = campathXml([a, b], 6, true);
    const points = pathPoints(xml);
    expect(points).toHaveLength(6 * 20 + 1);
    expect(points[0]).toMatchObject({ t: 0, x: 0, z: 0, yaw: 170, pitch: 0, fov: 90 });
    expect(points.at(-1)).toMatchObject({ t: 6, x: 100, z: 50, pitch: 20, fov: 70 });
    expect(xml).toContain('hold=""');
    expect(xml).toContain('rx="0" ry="0" rz="170"');
    // yaw 170 → -170 goes the short way over 180 (to 190), not back through 0
    expect(points.at(-1)!.yaw).toBeCloseTo(190, 3);
    expect(points[60].yaw).toBeGreaterThan(175);
    // soft start: the first step is much shorter than a step in the middle
    expect(points[1].x - points[0].x).toBeLessThan((points[61].x - points[60].x) / 10);
  });

  it('moves at an even speed through views at uneven distances', () => {
    const view = (x: number) => ({ x, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 90 });
    const points = pathPoints(campathXml([view(0), view(100), view(1100)], 10, false));
    const speedAround = (x: number) => {
      const i = points.findIndex((p) => p.x >= x);
      const speed = (points[i + 1].x - points[i].x) / (points[i + 1].t - points[i].t);
      return speed / Math.sin((Math.PI * points[i].t) / 10); // take out the soft start / stop
    };
    // without arc-length timing the short first segment would be ten times slower
    expect(speedAround(600) / speedAround(80)).toBeCloseTo(1, 1);
    // the path never runs backwards or beyond the last view
    expect(points.every((p, i) => i === 0 || p.x >= points[i - 1].x - 1e-6)).toBe(true);
    expect(Math.max(...points.map((p) => p.x))).toBeLessThanOrEqual(1100);
  });

  it('writes the path file and plays it from now', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-cam-'));
    const view = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 90 };
    const commands = playPathCommands(dir, [view, { ...view, x: 10 }, { ...view, x: 20 }], 4, false);
    const file = path.join(dir, 'campaths', 'tacam-path.xml');
    expect(fs.existsSync(file)).toBe(true);
    expect(commands).toEqual(['mirv_input end', 'mirv_campath enabled 0', 'mirv_campath clear', `mirv_campath load "${file}"`, 'mirv_campath hold 0', 'mirv_campath offset current', 'mirv_campath enabled 1']);

    const received: string[] = [];
    const console = await fakeCs2(true, received);
    await console.sendAll(commands, 100);
    expect(received.filter((c) => !c.startsWith('engine_no_focus_sleep'))).toEqual(commands);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('follows a player: leaves HLAE camera/path, then spec_player + spec_mode 1', () => {
    expect(spectateCommands('m0NESY')).toEqual(['mirv_campath enabled 0', 'mirv_input end', 'spec_player "m0NESY"', 'spec_mode 1']);
    // spaces stay inside the quotes; quotes and separators cannot break out of the command
    expect(spectateCommands('Team "X"; quit')[2]).toBe('spec_player "Team X quit"');
    expect(() => spectateCommands('"";')).toThrow('empty');
    expect(stepCommands('next')).toEqual(['mirv_campath enabled 0', 'mirv_input end', 'spec_next', 'spec_mode 1']);
  });
});

describe('mapLoadWatcher', () => {
  it('fires on a map / demo load, not on the first packet after start or the same map', () => {
    let loads = 0;
    const seen = mapLoadWatcher(() => loads++);
    seen('de_mirage'); // TacAM just started: keep the running view
    seen('de_mirage');
    expect(loads).toBe(0);
    seen(undefined); // main menu between two demos
    seen('de_mirage'); // same map loaded again
    seen('de_inferno');
    expect(loads).toBe(2);
  });

  it('reports going back to the main menu, but not before a map was seen', () => {
    let leaves = 0;
    const seen = mapLoadWatcher(() => {}, () => leaves++);
    seen(undefined); // TacAM started while CS2 is in the menu
    seen('de_mirage');
    seen(undefined);
    seen(undefined);
    expect(leaves).toBe(1);
  });
});

describe('commandLines', () => {
  it('takes one command per line and skips empty lines and comments', () => {
    expect(commandLines('// HUD\r\ncl_draw_only_deathnotices 1\n\n  engine_no_focus_sleep 0  \n')).toEqual(['cl_draw_only_deathnotices 1', 'engine_no_focus_sleep 0']);
  });
});

describe('CameraControl', () => {
  const setup = () => {
    const sent: string[] = [];
    const fake = { sendAll: async (commands: string[]) => (sent.push(...commands), []) } as unknown as GameConsole;
    const states: CameraState[] = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-camctl-'));
    return { sent, states, dir, control: new CameraControl(fake, dir, (s) => states.push(s)) };
  };
  const view = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 90 };

  it('tracks the mode; a manual move switches the auto director off', async () => {
    const { sent, states, dir, control } = setup();
    await control.autoDirector(true);
    expect(sent.at(-1)).toBe('spec_autodirector 1');
    expect(control.state).toEqual({ mode: 'game', autoDirector: true });
    await control.goTo(view);
    expect(control.state).toEqual({ mode: 'view', autoDirector: false });
    expect(sent).toContain('spec_autodirector 0');
    await control.spectate('nexo');
    expect(control.state.mode).toBe('game');
    expect(states.map((s) => s.mode)).toEqual(['game', 'view', 'game']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('goes back to the game view after a path without hold', async () => {
    vi.useFakeTimers();
    const { dir, control } = setup();
    await control.playPath([view, { ...view, x: 100 }], 2, false);
    expect(control.state.mode).toBe('path');
    vi.advanceTimersByTime(2100);
    expect(control.state.mode).toBe('game');
    await control.playPath([view, { ...view, x: 100 }], 2, true);
    vi.advanceTimersByTime(5000);
    expect(control.state.mode).toBe('path');
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
