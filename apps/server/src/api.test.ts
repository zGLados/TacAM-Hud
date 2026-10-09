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
