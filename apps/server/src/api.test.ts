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

  it('shows halftime for a paused half break and keeps a scene picked by hand', async () => {
    const team = { score: 6, consecutive_round_losses: 0, timeouts_remaining: 1, matches_won_this_series: 0 };
    const gsi = (round: number, phase: string) => ({
      auth: { token: server.store.doc('settings').gsiToken },
      provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 1, steamid: '1', timestamp: 1 },
      map: { mode: 'competitive', name: 'de_inferno', phase: 'live', round, team_ct: team, team_t: team, num_matches_to_win_series: 0, current_spectators: 0, souvenirs_total: 0, round_wins: {} },
      round: { phase: 'freezetime' },
      allplayers: {},
      phase_countdowns: { phase, phase_ends_in: '10.0' },
    });
    const send = (round: number, phase: string) => fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', gsi(round, phase)));
    const scene = async () => (await (await fetch(`${base}/scene`)).json()).active;
    await fetch(`${base}/scene`, json('PUT', { active: 'live', auto: true, message: '', countdownTo: null }));

    await send(12, 'freezetime');
    await send(12, 'paused'); // mp_halftime_pausematch: paused instead of intermission
    expect(await scene()).toBe('halftime');

    // the producer overrides the automation; further ticks must not undo it
    await fetch(`${base}/scene`, json('PUT', { active: 'pause', auto: true, message: '', countdownTo: null }));
    await send(12, 'paused');
    await send(12, 'paused');
    expect(await scene()).toBe('pause');

    await send(12, 'live');
    expect(await scene()).toBe('live');
    await send(5, 'paused'); // a normal pause is still a pause
    expect(await scene()).toBe('pause');

    // wingman (MR8): the half break is after 8 rounds, 12 is a normal pause
    const wingman = (round: number, phase: string) => {
      const raw = gsi(round, phase);
      return fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', { ...raw, map: { ...raw.map, mode: 'scrimcomp2v2' } }));
    };
    await wingman(8, 'freezetime');
    await wingman(8, 'paused');
    expect(await scene()).toBe('halftime');
    await wingman(12, 'live');
    await wingman(12, 'paused');
    expect(await scene()).toBe('pause');
  });

  it('keeps team sides after halftime and ignores coaches', async () => {
    const coach = '76561198999999999';
    await fetch(`${base}/players`, json('POST', { steamid: coach, username: 'coach', firstName: '', lastName: '', country: null, avatar: null, teamId: null, isCoach: true, extra: {} }));
    const config = await (await fetch(`${base}/hud/config`)).json();
    const setKeep = (keepTeamSides: boolean) => fetch(`${base}/hud/config`, json('PUT', { ...config, keepTeamSides }));

    const player = (side: 'CT' | 'T', slot: number) => ({
      name: `p${slot}`,
      observer_slot: slot,
      team: side,
      match_stats: { kills: 0, assists: 0, deaths: 0, mvps: 0, score: 0 },
      weapons: {},
      state: { health: 100, armor: 0, helmet: false, flashed: 0, smoked: 0, burning: 0, money: 800, round_kills: 0, round_killhs: 0, round_totaldmg: 0, equip_value: 200 },
      position: '0, 0, 0',
      forward: '1, 0, 0',
    });
    const team = (name: string) => ({ name, score: 0, consecutive_round_losses: 0, timeouts_remaining: 1, matches_won_this_series: 0 });
    // CS2 keeps CT on the low observer slots (= left) for the whole map; the coach takes slot 1.
    const gsi = (ct: string, t: string, round: number) => ({
      auth: { token: server.store.doc('settings').gsiToken },
      provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 1, steamid: '1', timestamp: 1 },
      map: { mode: 'competitive', name: 'de_nuke', phase: 'live', round, team_ct: team(ct), team_t: team(t), num_matches_to_win_series: 0, current_spectators: 0, souvenirs_total: 0, round_wins: {} },
      round: { phase: 'live' },
      player: { steamid: coach, name: 'coach', observer_slot: 1, team: round < 12 ? 'T' : 'CT' },
      allplayers: {
        [coach]: player(round < 12 ? 'T' : 'CT', 1),
        '76561198100000002': player('CT', 2),
        '76561198100000003': player('CT', 3),
        '76561198100000006': player('T', 6),
        '76561198100000007': player('T', 7),
      },
      phase_countdowns: { phase: 'live', phase_ends_in: '100.0' },
    });
    const send = (ct: string, t: string, round: number) => fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', gsi(ct, t, round)));
    const summary = async () => (await (await fetch(`${base}/live`)).json()).summary;

    await setKeep(true);
    await send('Alpha', 'Beta', 3);
    let live = await summary();
    expect([live.left.name, live.right.name]).toEqual(['Alpha', 'Beta']);
    expect(live.observed).toBeNull();
    expect(live.players.map((p: { steamid: string }) => p.steamid)).not.toContain(coach);

    await send('Beta', 'Alpha', 13); // second half: Beta is CT now and CS2 shows CT on the left
    live = await summary();
    expect([live.left.name, live.right.name]).toEqual(['Alpha', 'Beta']);

    await setKeep(false);
    await send('Beta', 'Alpha', 14);
    live = await summary();
    expect([live.left.name, live.right.name]).toEqual(['Beta', 'Alpha']);
  });

  it('keeps a newly added random default across restarts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-store-'));
    const file = path.join(dir, 'db.json');
    const { Store } = await import('./store.js');
    new Store(dir);
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete db.settings.actionKey; // database from a version without the field
    fs.writeFileSync(file, JSON.stringify(db));
    const first = new Store(dir).doc('settings').actionKey;
    expect(new Store(dir).doc('settings').actionKey).toBe(first);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs trigger actions only with the action key', async () => {
    const key = server.store.doc('settings').actionKey;
    expect((await fetch(`${base}/trigger/scene-brb`)).status).toBe(403);
    expect((await fetch(`${base}/trigger/scene-brb?key=wrong`, json('POST'))).status).toBe(403);
    expect((await fetch(`${base}/trigger/nope?key=${key}`)).status).toBe(404);

    expect((await fetch(`${base}/trigger/scene-brb?key=${key}`)).status).toBe(200);
    expect((await (await fetch(`${base}/scene`)).json()).active).toBe('brb');
    const swapped = server.store.doc('hudConfig').swapTeams;
    await fetch(`${base}/trigger/swap-teams`, { method: 'POST', headers: { 'x-tacam-key': key } });
    expect(server.store.doc('hudConfig').swapTeams).toBe(!swapped);

    const status = await (await fetch(`${base}/trigger-status?key=${key}`)).json();
    expect(status.scene).toBe('brb');
    expect(status.active['scene-brb']).toBe(true);
    expect(status.active['scene-live']).toBe(false);
    expect(status.active['swap-teams']).toBe(!swapped);
    expect(await (await fetch(`${base}/trigger-status/scene-brb?key=${key}&format=text`)).text()).toBe('1');
    expect((await fetch(`${base}/trigger-status?key=wrong`)).status).toBe(403);
    expect((await fetch(`${base}/trigger-status/hud-refresh?key=${key}`)).status).toBe(404); // no state

    // a new key invalidates the old URLs
    const { actionKey } = await (await fetch(`${base}/settings/action-key`, json('POST'))).json();
    expect(actionKey).not.toBe(key);
    expect((await fetch(`${base}/trigger/scene-live?key=${key}`)).status).toBe(403);
    expect((await fetch(`${base}/trigger/scene-live?key=${actionKey}`)).status).toBe(200);
  });

  it('validates and stores keyboard shortcuts', async () => {
    const save = (keybinds: Record<string, string>) => fetch(`${base}/settings/keybinds`, json('PUT', keybinds));
    expect((await save({ 'radar-bigger': 'Ctrl+Shift+F5', 'scene-brb': 'Alt+\\', 'hud-toggle': '' })).status).toBe(200);
    expect(server.store.doc('settings').keybinds).toEqual({ 'radar-bigger': 'Ctrl+Shift+F5', 'scene-brb': 'Alt+\\', 'hud-toggle': '' });
    expect((await save({ 'radar-bigger': 'V' })).status).toBe(400); // no modifier
    expect((await save({ 'radar-bigger': 'Alt+Alt+V' })).status).toBe(400);
    expect((await save({ 'radar-bigger': 'Alt+Ü' })).status).toBe(400);
    expect((await save({ nope: 'Alt+V' })).status).toBe(400);
    const duplicate = await save({ 'radar-bigger': 'Alt+V', 'radar-smaller': 'Alt+V' });
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error).toContain('used twice');
    expect(server.actions.some((a) => a.id === 'overlay-scoreboard')).toBe(true);
  });

  it('runs a captain veto from the team links', async () => {
    const team = async (name: string) => (await (await fetch(`${base}/teams`, json('POST', { name, shortName: name, country: null, logo: null, extra: {} }))).json()).id;
    const [a, b] = [await team('Alpha'), await team('Bravo')];
    const match = await (await fetch(`${base}/matches`, json('POST', { left: { id: a, wins: 0 }, right: { id: b, wins: 0 }, matchType: 'bo3' }))).json();
    const pool = ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 'de_train'];
    expect((await fetch(`${base}/matches/${match.id}/captain-veto`, json('POST', { first: 'right', sideChoice: true, pool: pool.slice(0, 6) }))).status).toBe(400);
    const started = await (await fetch(`${base}/matches/${match.id}/captain-veto`, json('POST', { first: 'right', sideChoice: true, pool }))).json();
    const { left, right, both } = started.captainVeto.tokens;
    const act = (token: string, body: unknown) => fetch(`${base}/captain/${token}`, json('POST', body));

    expect((await act(left, { action: 'ban', map: 'de_nuke' })).status).toBe(409); // right starts
    expect((await act(right, { action: 'pick', map: 'de_nuke' })).status).toBe(400); // a ban is due
    expect((await act(right, { action: 'ban', map: 'de_nuke' })).status).toBe(200);
    expect((await act(left, { action: 'ban', map: 'de_nuke' })).status).toBe(400); // already gone
    await act(left, { action: 'ban', map: 'de_train' });
    await act(right, { action: 'pick', map: 'de_mirage' });
    await act(left, { action: 'side', side: 'CT' }); // left starts CT on right's pick
    await act(both, { action: 'pick', map: 'de_inferno' }); // the shared link may act for both
    await act(both, { action: 'side', side: 'T' });
    await act(right, { action: 'ban', map: 'de_ancient' });
    const last = await (await act(left, { action: 'ban', map: 'de_anubis' })).json();
    expect(last.done).toBe(true);

    const vetos = server.store.get('matches', match.id)!.vetos;
    expect(vetos.map((v) => `${v.type}:${v.mapName}`)).toEqual([
      'ban:de_nuke', 'ban:de_train', 'pick:de_mirage', 'pick:de_inferno', 'ban:de_ancient', 'ban:de_anubis', 'decider:de_dust2',
    ]);
    expect(vetos[2]).toMatchObject({ teamId: b, side: 'T' }); // picker starts on the other side
    expect(vetos[3]).toMatchObject({ teamId: a, side: 'CT' });
    expect((await act(left, { action: 'ban', map: 'de_dust2' })).status).toBe(409);

    await fetch(`${base}/matches/${match.id}/captain-veto`, { method: 'DELETE' });
    expect((await fetch(`${base}/captain/${left}`)).status).toBe(404);
    expect(server.store.get('matches', match.id)!.vetos).toHaveLength(7);
  });

  it('fires signals on game events (action and HTTP request)', async () => {
    const { createServer } = await import('node:http');
    const hits: string[] = [];
    const receiver = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      res.end('ok');
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/api/location/1/0/2/press`;
    const rules = [
      { id: 'a', enabled: true, event: 'roundEnd', filter: 'CT', output: { kind: 'action', action: 'overlay-scoreboard' }, delay: 0 },
      { id: 'b', enabled: true, event: 'roundEnd', filter: null, output: { kind: 'http', method: 'POST', url }, delay: 0 },
      { id: 'c', enabled: true, event: 'roundEnd', filter: 'T', output: { kind: 'http', method: 'GET', url: `${url}?t` }, delay: 0 },
      { id: 'd', enabled: false, event: 'roundEnd', filter: null, output: { kind: 'http', method: 'GET', url: `${url}?off` }, delay: 0 },
    ];
    expect((await fetch(`${base}/settings/signals`, json('PUT', [{ ...rules[0], output: { kind: 'action', action: 'nope' } }]))).status).toBe(400);
    expect((await fetch(`${base}/settings/signals`, json('PUT', rules))).status).toBe(200);
    await fetch(`${base}/hud/config`, json('PUT', { ...server.store.doc('hudConfig'), overlay: 'none' }));

    const team = { score: 3, consecutive_round_losses: 0, timeouts_remaining: 1, matches_won_this_series: 0 };
    const gsi = (round: object) => ({
      auth: { token: server.store.doc('settings').gsiToken },
      provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 1, steamid: '1', timestamp: 1 },
      map: { mode: 'competitive', name: 'de_nuke', phase: 'live', round: 6, team_ct: team, team_t: team, num_matches_to_win_series: 0, current_spectators: 0, souvenirs_total: 0, round_wins: {} },
      round,
      allplayers: {},
      phase_countdowns: { phase: 'live', phase_ends_in: '10.0' },
    });
    await fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', gsi({ phase: 'live' })));
    await fetch(`http://127.0.0.1:${gsiPort}/`, json('POST', gsi({ phase: 'over', win_team: 'CT' })));
    await new Promise((r) => setTimeout(r, 300));

    expect(server.store.doc('hudConfig').overlay).toBe('scoreboard');
    expect(hits).toEqual(['POST /api/location/1/0/2/press']); // T filter and disabled rule did not fire
    const log = await (await fetch(`${base}/signals/log`)).json();
    expect(log.map((e: { ruleId: string; ok: boolean }) => `${e.ruleId}:${e.ok}`).sort()).toEqual(['a:true', 'b:true']);

    const test = await (await fetch(`${base}/signals/test`, json('POST', rules[2]))).json();
    expect(test.ok).toBe(true);
    expect(hits).toHaveLength(2);
    receiver.close();
    await fetch(`${base}/settings/signals`, json('PUT', []));
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
