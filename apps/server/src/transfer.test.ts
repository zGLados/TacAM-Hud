import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { TRANSFER_SECTIONS } from '@tacam/shared';
import { Store } from './store.js';
import { DEFAULT_KEYBINDS, type TriggerAction } from './actions.js';
import { SettingsTransfer, TransferError, exportFileName } from './transfer.js';

const dirs: string[] = [];
const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.flush();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const actions = [...Object.keys(DEFAULT_KEYBINDS), 'scene-brb'].map((id) => ({ id, group: 'HUD', label: id, run: () => {} }) as TriggerAction);

/** A fresh TacAM data folder (db.json + uploads). */
function install() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-transfer-'));
  dirs.push(dataDir);
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir);
  const store = new Store(dataDir);
  stores.push(store);
  return { store, uploadsDir, transfer: new SettingsTransfer({ store, uploadsDir, actions }) };
}

const player = (steamid: string, username: string, teamId: string | null, avatar: string | null = null) => ({
  steamid,
  username,
  firstName: '',
  lastName: '',
  country: null,
  avatar,
  teamId,
  isCoach: false,
  extra: {},
});

/** Source PC with a bit of everything. */
function source() {
  const src = install();
  fs.writeFileSync(path.join(src.uploadsDir, 'logo-a.png'), 'logo A');
  fs.writeFileSync(path.join(src.uploadsDir, 'avatar.png'), 'avatar');
  fs.writeFileSync(path.join(src.uploadsDir, 'video.mp4'), 'video');
  const teamA = src.store.insert('teams', { name: 'Alpha', shortName: 'ALP', country: 'DE', logo: 'logo-a.png', extra: {} });
  const teamB = src.store.insert('teams', { name: 'Bravo', shortName: 'BRV', country: null, logo: null, extra: {} });
  src.store.insert('players', player('76561198000000001', 'one', teamA.id, 'avatar.png'));
  src.store.insert('players', player('76561198000000002', 'two', teamB.id));
  src.store.insert('matches', {
    left: { id: teamA.id, wins: 1 },
    right: { id: teamB.id, wins: 0 },
    matchType: 'bo3',
    current: true,
    vetos: [{ type: 'pick', mapName: 'de_mirage', teamId: teamA.id, side: 'CT', reverseSide: false, score: { [teamA.id]: 13, [teamB.id]: 7 }, winner: teamA.id, mapEnd: true }],
    title: 'Final',
    startTime: null,
    roundsPerHalf: null,
    captainVeto: null,
  } as never);
  src.store.setDoc('theme', { ...src.store.doc('theme'), tournamentName: 'Cup', brandLogo: 'logo-a.png', backgroundVideos: [{ id: 'v', file: 'video.mp4', label: 'Loop' }] });
  const shots = [
    { id: 's1', name: 'A site', map: 'de_mirage', x: 1, y: 2, z: 3, pitch: 0, yaw: 90, roll: 0, fov: 90 },
    { id: 's2', name: 'B site', map: 'de_mirage', x: 4, y: 5, z: 6, pitch: 10, yaw: 180, roll: 0, fov: 90 },
  ];
  const settings = src.store.doc('settings');
  src.store.setDoc('settings', {
    ...settings,
    accessPin: '1234',
    cameraShots: shots,
    cameraPaths: [{ id: 'p1', name: 'Overview', map: 'de_mirage', shotIds: ['s1', 's2'], duration: 6, hold: false }],
    mapLoadCommands: 'cl_draw_only_deathnotices 1',
    obs: { enabled: true, url: 'ws://10.0.0.5:4455', password: 'secret', sceneMap: { brb: 'BRB' } },
    signals: [{ id: 'sig', enabled: true, event: 'roundEnd', filter: null, output: { kind: 'action', action: 'camera-path-p1' }, delay: 2 }],
    keybinds: { ...settings.keybinds, 'scene-brb': 'Alt+B' },
  });
  return { ...src, teamA, teamB };
}

const exportAll = (transfer: SettingsTransfer, videos = false) => transfer.export([...TRANSFER_SECTIONS], { appVersion: '0.4.0', videos });

describe('settings export', () => {
  it('writes readable JSON per section plus the referenced uploads, without secrets', () => {
    const src = source();
    const files = unzipSync(exportAll(src.transfer));
    const names = Object.keys(files);
    expect(names).toEqual(expect.arrayContaining(['manifest.json', 'teams.json', 'matches.json', 'hud.json', 'huds.json', 'camera.json', 'integrations.json', 'uploads/logo-a.png', 'uploads/avatar.png']));
    // Videos only on request: they can be hundreds of MB.
    expect(names).not.toContain('uploads/video.mp4');
    expect(Object.keys(unzipSync(exportAll(src.transfer, true)))).toContain('uploads/video.mp4');

    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest).toMatchObject({ format: 'tacam-export', formatVersion: 1, appVersion: '0.4.0', sections: [...TRANSFER_SECTIONS] });
    const text = names.filter((n) => n.endsWith('.json')).map((n) => new TextDecoder().decode(files[n])).join('\n');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('1234');
    expect(text).not.toContain(src.store.doc('settings').actionKey);
    expect(text).not.toContain(src.store.doc('settings').gsiToken);
  });

  it('names the file after the sections', () => {
    expect(exportFileName([...TRANSFER_SECTIONS])).toMatch(/^tacam-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(exportFileName(['teams'])).toMatch(/^tacam-teams-/);
  });
});

describe('settings import', () => {
  it('moves everything to an empty installation', () => {
    const src = source();
    const dst = install();
    const preview = dst.transfer.preview(exportAll(src.transfer));
    expect(preview.appVersion).toBe('0.4.0');
    expect(preview.sections.find((s) => s.section === 'teams')?.summary).toBe('2 teams (2 new), 2 players (2 new)');
    // The preview changes nothing.
    expect(dst.store.list('teams')).toHaveLength(0);

    const result = dst.transfer.apply(preview.id, [...TRANSFER_SECTIONS], 'merge');
    expect(result.skipped).toEqual([]);
    const teams = dst.store.list('teams');
    expect(teams.map((t) => t.name)).toEqual(['Alpha', 'Bravo']);
    expect(fs.readFileSync(path.join(dst.uploadsDir, teams[0].logo!), 'utf8')).toBe('logo A');
    const one = dst.store.list('players').find((p) => p.username === 'one')!;
    expect(one.teamId).toBe(teams[0].id);
    expect(fs.readFileSync(path.join(dst.uploadsDir, one.avatar!), 'utf8')).toBe('avatar');

    const match = dst.store.list('matches')[0];
    expect(match).toMatchObject({ title: 'Final', current: true, left: { id: teams[0].id }, captainVeto: null });
    expect(match.vetos[0].score).toEqual({ [teams[0].id]: 13, [teams[1].id]: 7 });

    expect(dst.store.doc('theme').tournamentName).toBe('Cup');
    // The video was not in the file and does not exist here.
    expect(dst.store.doc('theme').backgroundVideos).toEqual([]);

    const settings = dst.store.doc('settings');
    expect(settings.cameraPaths.map((p) => p.name)).toEqual(['Overview']);
    expect(settings.mapLoadCommands).toBe('cl_draw_only_deathnotices 1');
    expect(settings.obs).toMatchObject({ url: 'ws://10.0.0.5:4455', password: '', sceneMap: { brb: 'BRB' } });
    // The signal points at the camera path imported in the same run.
    expect(settings.signals).toHaveLength(1);
    expect(settings.keybinds['scene-brb']).toBe('Alt+B');
    // Alt+B was radar-smaller by default: one key, one action.
    expect(settings.keybinds['radar-smaller']).toBe('');
    // Secrets of the target stay.
    expect(settings.accessPin).toBe('');
  });

  it('merges teams by name and players by SteamID instead of duplicating them', () => {
    const src = source();
    const dst = install();
    const local = dst.store.insert('teams', { name: 'alpha', shortName: 'OLD', country: null, logo: null, extra: {} });
    dst.store.insert('players', player('76561198000000001', 'old name', null));
    dst.store.insert('players', player('76561198000000099', 'local only', local.id));

    const preview = dst.transfer.preview(src.transfer.export(['teams'], { appVersion: null, videos: false }));
    expect(preview.sections).toEqual([{ section: 'teams', summary: '2 teams (1 new, 1 updated), 2 players (1 new, 1 updated)' }]);
    dst.transfer.apply(preview.id, ['teams'], 'merge');

    const teams = dst.store.list('teams');
    expect(teams).toHaveLength(2);
    expect(teams.find((t) => t.id === local.id)).toMatchObject({ name: 'Alpha', shortName: 'ALP' });
    const players = dst.store.list('players');
    expect(players).toHaveLength(3);
    expect(players.find((p) => p.steamid === '76561198000000001')).toMatchObject({ username: 'one', teamId: local.id });
    expect(players.find((p) => p.username === 'local only')).toBeTruthy();
  });

  it('replaces a section completely when asked', () => {
    const src = source();
    const dst = install();
    dst.store.insert('teams', { name: 'Gone', shortName: '', country: null, logo: null, extra: {} });
    const preview = dst.transfer.preview(src.transfer.export(['teams'], { appVersion: null, videos: false }));
    expect(dst.transfer.check(preview.id, ['teams'], 'replace').sections[0].summary).toBe('2 teams (2 new), 2 players (2 new) – replaces 1 existing');
    dst.transfer.apply(preview.id, ['teams'], 'replace');
    expect(dst.store.list('teams').map((t) => t.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('keeps an existing upload with the same name but different content', () => {
    const src = source();
    const dst = install();
    fs.writeFileSync(path.join(dst.uploadsDir, 'logo-a.png'), 'another logo');
    const preview = dst.transfer.preview(src.transfer.export(['teams'], { appVersion: null, videos: false }));
    dst.transfer.apply(preview.id, ['teams'], 'merge');
    const logo = dst.store.list('teams').find((t) => t.name === 'Alpha')!.logo!;
    expect(logo).not.toBe('logo-a.png');
    expect(fs.readFileSync(path.join(dst.uploadsDir, logo), 'utf8')).toBe('logo A');
    expect(fs.readFileSync(path.join(dst.uploadsDir, 'logo-a.png'), 'utf8')).toBe('another logo');
  });

  it('only imports the chosen sections, and each file once', () => {
    const src = source();
    const dst = install();
    const preview = dst.transfer.preview(exportAll(src.transfer));
    dst.transfer.apply(preview.id, ['camera'], 'merge');
    expect(dst.store.list('teams')).toHaveLength(0);
    expect(dst.store.doc('settings').cameraShots).toHaveLength(2);
    expect(() => dst.transfer.apply(preview.id, ['teams'], 'merge')).toThrow(TransferError);
  });

  it('skips invalid entries and reports them', () => {
    const src = source();
    src.store.setDoc('settings', { ...src.store.doc('settings'), cameraShots: [{ id: 's1', name: '', map: 'de_mirage', x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 90 }] });
    const dst = install();
    const preview = dst.transfer.preview(src.transfer.export(['camera'], { appVersion: null, videos: false }));
    const result = dst.transfer.apply(preview.id, ['camera'], 'merge');
    expect(result.skipped).toEqual([expect.stringContaining('View'), 'Camera path "Overview": a view is missing']);
    expect(dst.store.doc('settings').cameraPaths).toEqual([]);
  });

  it('moves imported HUDs with their settings panel values', () => {
    const src = source();
    const folder = path.join(src.store.dataDir, 'huds', 'my-hud-abc123');
    fs.mkdirSync(path.join(folder, 'static'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'hud.json'), JSON.stringify({ name: 'My HUD' }));
    fs.writeFileSync(path.join(folder, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(folder, 'static', 'app.js'), 'console.log(1)');
    src.store.setDoc('settings', { ...src.store.doc('settings'), hudPanels: { 'my-hud-abc123': { trivia: { title: 'Hi' } } } });

    const dst = install();
    const preview = dst.transfer.preview(src.transfer.export(['huds'], { appVersion: null, videos: false }));
    expect(preview.sections).toEqual([{ section: 'huds', summary: '1 HUD (1 new)' }]);
    dst.transfer.apply(preview.id, ['huds'], 'merge');
    const target = path.join(dst.store.dataDir, 'huds', 'my-hud-abc123');
    expect(fs.readFileSync(path.join(target, 'static', 'app.js'), 'utf8')).toBe('console.log(1)');
    expect(dst.store.doc('settings').hudPanels).toEqual({ 'my-hud-abc123': { trivia: { title: 'Hi' } } });
  });

  it('rejects files that are not a TacAM export', () => {
    const { transfer } = install();
    expect(() => transfer.preview(new TextEncoder().encode('no zip'))).toThrow('Not a valid zip file');
    expect(() => transfer.preview(new Uint8Array(Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64')))).toThrow(/not a TacAM HUD export/);
  });
});
