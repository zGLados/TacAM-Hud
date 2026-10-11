import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { campathXml, goToCommands, hlaeActive, mapLoadWatcher, parseCurrentView, playPathCommands, readView, spectateCommands, stepCommands } from './camera.js';
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

  it('builds a campath with at least four keyframes and HLAE angle attributes', () => {
    const a = { x: 0, y: 0, z: 0, pitch: 0, yaw: 170, roll: 0, fov: 90 };
    const b = { x: 100, y: 0, z: 50, pitch: 20, yaw: -170, roll: 0, fov: 70 };
    const xml = campathXml([a, b], 6, true);
    const points = [...xml.matchAll(/<p t="([\d.]+)" x="([-\d.]+)"[^>]*rz="([-\d.]+)"/g)];
    expect(points.map((p) => Number(p[1]))).toEqual([0, 2, 4, 6]);
    expect(xml).toContain('hold=""');
    // yaw 170 → -170 goes the short way over 180 (not back through 0)
    expect(Number(points[1][3])).toBeCloseTo(176.667, 2);
    expect(Number(points[2][3])).toBeCloseTo(183.333, 2);
    expect(xml).toContain('rx="0" ry="0" rz="170"');
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
});
