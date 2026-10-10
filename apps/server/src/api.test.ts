import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@tacam/shared';
import { createTacamServer, type TacamServer } from './app.js';

const port = 41000 + Math.floor(Math.random() * 1000);
const gsiPort = port + 1000;
const base = `http://127.0.0.1:${port}/api`;
let server: TacamServer;
let dataDir: string;

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-test-'));
  server = createTacamServer({ dataDir, port, gsiPort });
  await server.start();
});

afterAll(async () => {
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('API', () => {
  it('creates, updates and deletes teams and players', async () => {
    const team = await (await fetch(`${base}/teams`, json('POST', { name: 'TacAM', shortName: 'TCM' }))).json();
    expect(team.id).toBeTruthy();

    const res = await fetch(`${base}/players`, json('POST', { steamid: '76561198000000001', username: 'zGLados', teamId: team.id }));
    expect(res.status).toBe(201);
    const player = await res.json();

    const dup = await fetch(`${base}/players`, json('POST', { steamid: '76561198000000001', username: 'x' }));
    expect(dup.status).toBe(409);

    await fetch(`${base}/teams/${team.id}`, { method: 'DELETE' });
    const players = await (await fetch(`${base}/players`)).json();
    expect(players.find((p: { id: string }) => p.id === player.id).teamId).toBeNull();
  });

  it('rejects invalid steam ids', async () => {
    const res = await fetch(`${base}/players`, json('POST', { steamid: '123', username: 'x' }));
    expect(res.status).toBe(400);
  });

  it('rejects theme colors that are not plain colors', async () => {
    const bad = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, primary: 'red; } body { display:none' } };
    expect((await fetch(`${base}/theme`, json('PUT', bad))).status).toBe(400);
    expect((await fetch(`${base}/theme`, json('PUT', DEFAULT_THEME))).status).toBe(200);
  });

  it('keeps only one current match', async () => {
    const body = { left: { id: null }, right: { id: null }, matchType: 'bo1', current: true };
    const a = await (await fetch(`${base}/matches`, json('POST', body))).json();
    const b = await (await fetch(`${base}/matches`, json('POST', body))).json();
    const matches = await (await fetch(`${base}/matches`)).json();
    expect(matches.filter((m: { current: boolean }) => m.current).map((m: { id: string }) => m.id)).toEqual([b.id]);
    expect(a.id).not.toBe(b.id);
  });

  it('accepts videos only on the video upload endpoint', async () => {
    const form = (type: string, name: string) => {
      const body = new FormData();
      body.append('file', new Blob(['fake'], { type }), name);
      return { method: 'POST', body };
    };
    const video = await fetch(`${base}/uploads/video`, form('video/mp4', 'clip.mp4'));
    expect(video.status).toBe(201);
    expect((await video.json()).file).toMatch(/\.mp4$/);
    expect((await fetch(`${base}/uploads/video`, form('text/plain', 'x.txt'))).status).toBe(400);
    expect((await fetch(`${base}/uploads`, form('video/mp4', 'clip.mp4'))).status).toBe(400);
  });

  it('forgets demo stats when real GSI data arrives', async () => {
    await fetch(`${base}/demo/start`, json('POST'));
    await new Promise((r) => setTimeout(r, 600));
    const demoStats = await (await fetch(`${base}/stats`)).json();
    expect(demoStats.players.length).toBeGreaterThan(0);

    const team = { score: 0, consecutive_round_losses: 0, timeouts_remaining: 1, matches_won_this_series: 0 };
    const player = (side: 'CT' | 'T', slot: number) => ({
      name: `real${slot}`,
      observer_slot: slot,
      team: side,
      match_stats: { kills: 0, assists: 0, deaths: 0, mvps: 0, score: 0 },
      weapons: {},
      state: { health: 100, armor: 0, helmet: false, flashed: 0, smoked: 0, burning: 0, money: 800, round_kills: 0, round_killhs: 0, round_totaldmg: 0, equip_value: 200 },
      position: '0, 0, 0',
      forward: '1, 0, 0',
    });
    const raw = {
      auth: { token: server.store.doc('settings').gsiToken },
      provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 1, steamid: '1', timestamp: 1 },
      map: { mode: 'competitive', name: 'de_mirage', phase: 'live', round: 0, team_ct: team, team_t: team, num_matches_to_win_series: 0, current_spectators: 0, souvenirs_total: 0, round_wins: {} },
      round: { phase: 'live' },
      allplayers: { '76561198111111111': player('CT', 1), '76561198222222222': player('T', 6) },
      phase_countdowns: { phase: 'live', phase_ends_in: '100.0' },
    };
    for (let i = 0; i < 2; i++) await fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', raw));

    const stats = await (await fetch(`${base}/stats`)).json();
    expect(stats.players.map((p: { steamid: string }) => p.steamid).sort()).toEqual(['76561198111111111', '76561198222222222']);
    expect((await (await fetch(`${base}/demo`)).json()).running).toBe(false);
  });

  it('refuses GSI data with a wrong token', async () => {
    const res = await fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', { auth: { token: 'nope' } }));
    expect(res.status).toBe(401);
  });

  it('accepts GSI data with the configured token', async () => {
    const token = server.store.doc('settings').gsiToken;
    const res = await fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', { auth: { token }, provider: {} }));
    expect(res.status).toBe(200);
    const live = await (await fetch(`${base}/live`)).json();
    expect(live.status.lastUpdate).toBeTypeOf('number');
  });
});
