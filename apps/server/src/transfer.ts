import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import {
  TRANSFER_SECTIONS,
  type CameraPath,
  type CameraShot,
  type Match,
  type PlayerProfile,
  type SignalRule,
  type TeamProfile,
  type TransferMode,
  type TransferPreview,
  type TransferResult,
  type TransferSection,
  type TransferSectionPreview,
} from '@tacam/shared';
import type { Store } from './store.js';
import type { TriggerAction } from './actions.js';
import { HudImportError, isHudDir, listHuds, readHudFiles, removeHud, writeHudFiles } from './huds.js';
import {
  commandText,
  hudConfigSchema,
  keybindsSchema,
  matchSchema,
  obsSchema,
  pathSchema,
  playerSchema,
  sceneSchema,
  shotSchema,
  signalRuleSchema,
  str,
  teamSchema,
  themeSchema,
} from './schemas.js';

/**
 * Export / import of settings as one zip: `manifest.json`, one JSON file per
 * section and the referenced uploads (logos, avatars, sponsors …) under
 * `uploads/`, imported HUDs under `huds/<dir>/`. Plain JSON on purpose, so a
 * file can be checked or edited by hand. Secrets (PIN, GSI token, action key,
 * OBS password) are never exported.
 */

const FORMAT = 'tacam-export';
const FORMAT_VERSION = 1;
/** Uploads keep their extension; only types the upload routes accept. */
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm']);
const PENDING_TTL = 15 * 60 * 1000;

export class TransferError extends Error {}

export interface TransferContext {
  store: Store;
  uploadsDir: string;
  actions: TriggerAction[];
}

interface Manifest {
  format: string;
  formatVersion: number;
  appVersion: string | null;
  createdAt: string | null;
  sections: TransferSection[];
}

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2));
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
/** "– replaces 3 existing" in replace mode, so the preview shows what gets deleted. */
const replaces = (run: { mode: TransferMode }, existing: number) => (run.mode === 'replace' && existing ? ` – replaces ${existing} existing` : '');
const counts = (n: number, word: string, added: number, updated: number, many?: string) =>
  `${plural(n, word, many)}${n ? ` (${[added && `${added} new`, updated && `${updated} updated`].filter(Boolean).join(', ') || 'unchanged'})` : ''}`;

// --- export ----------------------------------------------------------------

export function exportSettings(ctx: TransferContext, sections: TransferSection[], options: { appVersion: string | null; videos: boolean }): Uint8Array {
  const { store, uploadsDir } = ctx;
  const files: Zippable = {};
  const addUpload = (name: string | null | undefined) => {
    if (!name) return;
    const base = path.basename(name);
    const full = path.join(uploadsDir, base);
    // Media is already compressed: store it as is.
    if (!files[`uploads/${base}`] && fs.existsSync(full)) files[`uploads/${base}`] = [fs.readFileSync(full), { level: 0 }];
  };
  const settings = store.doc('settings');
  const included: TransferSection[] = [];

  for (const section of TRANSFER_SECTIONS.filter((s) => sections.includes(s))) {
    let data: unknown;
    if (section === 'teams') {
      const teams = store.list('teams');
      const players = store.list('players');
      teams.forEach((t) => addUpload(t.logo));
      players.forEach((p) => addUpload(p.avatar));
      data = { teams, players };
    } else if (section === 'matches') {
      // Captain veto links carry access tokens and belong to one PC.
      data = { matches: store.list('matches').map((m) => ({ ...m, captainVeto: null })) };
    } else if (section === 'hud') {
      const theme = store.doc('theme');
      const hudConfig = store.doc('hudConfig');
      const { auto, message } = store.doc('scene');
      theme.sponsors.forEach((s) => addUpload(s.file));
      [theme.brandLogo, theme.tournamentLogo, hudConfig.sideBoxes.left.image, hudConfig.sideBoxes.right.image].forEach(addUpload);
      if (options.videos) theme.backgroundVideos.forEach((v) => addUpload(v.file));
      data = { theme, hudConfig, scene: { auto, message } };
    } else if (section === 'huds') {
      const huds = listHuds(store.dataDir);
      for (const hud of huds) {
        for (const [name, content] of readHudFiles(store.dataDir, hud.dir)) files[`huds/${hud.dir}/${name}`] = content;
      }
      const panels = Object.fromEntries(huds.filter((h) => settings.hudPanels[h.dir]).map((h) => [h.dir, settings.hudPanels[h.dir]]));
      data = { huds: huds.map((h) => ({ dir: h.dir, name: h.name })), panels };
    } else if (section === 'camera') {
      const { cameraShots, cameraPaths, freeCameraOnMapLoad, mapLoadCommands, menuCommands } = settings;
      data = { shots: cameraShots, paths: cameraPaths, freeCameraOnMapLoad, mapLoadCommands, menuCommands };
    } else {
      const { enabled, url, sceneMap } = settings.obs;
      data = { obs: { enabled, url, sceneMap }, signals: settings.signals, keybinds: settings.keybinds };
    }
    files[`${section}.json`] = json(data);
    included.push(section);
  }

  const manifest: Manifest = { format: FORMAT, formatVersion: FORMAT_VERSION, appVersion: options.appVersion, createdAt: new Date().toISOString(), sections: included };
  files['manifest.json'] = json(manifest);
  return zipSync(files);
}

/** e.g. tacam-backup-2026-10-11.zip, tacam-teams-2026-10-11.zip */
export function exportFileName(sections: TransferSection[]) {
  const name = sections.length === TRANSFER_SECTIONS.length ? 'backup' : sections.join('-');
  return `tacam-${name}-${new Date().toISOString().slice(0, 10)}.zip`;
}

// --- import ----------------------------------------------------------------

type Entries = Record<string, Uint8Array>;

/** Uploads from the file: reused when the same file exists, renamed when the name is taken by another file. */
class UploadImporter {
  private readonly mapped = new Map<string, string | null>();
  written = 0;

  constructor(
    private readonly entries: Entries,
    private readonly uploadsDir: string,
    private readonly dry: boolean
  ) {}

  map(name: string | null | undefined): string | null {
    if (!name) return null;
    const base = path.basename(name);
    const extension = path.extname(base).toLowerCase();
    if (!/^[\w.-]{1,200}$/.test(base) || !MEDIA_EXTENSIONS.has(extension)) return null;
    if (this.mapped.has(base)) return this.mapped.get(base)!;
    const data = this.entries[`uploads/${base}`];
    const local = path.join(this.uploadsDir, base);
    let result: string | null;
    if (!data) {
      // Not in the file (e.g. videos left out): keep it if this PC has it.
      result = fs.existsSync(local) ? base : null;
    } else if (fs.existsSync(local) && Buffer.from(data).equals(fs.readFileSync(local))) {
      result = base;
    } else {
      result = fs.existsSync(local) ? `${randomUUID()}${extension}` : base;
      if (!this.dry) fs.writeFileSync(path.join(this.uploadsDir, result), data);
      this.written++;
    }
    this.mapped.set(base, result);
    return result;
  }
}

interface ImportRun {
  ctx: TransferContext;
  entries: Entries;
  mode: TransferMode;
  dry: boolean;
  uploads: UploadImporter;
  skipped: string[];
  /** Team id in the file → team id after the import (teams section). */
  teamIds: Map<string, string>;
  /** Team ids that exist after the import. */
  teams: Set<string>;
  /** Camera path ids after the import (their Stream Deck actions are valid in signals). */
  pathIds: string[];
}

const withId = { id: str.min(1).max(64) };
const teamRow = teamSchema.extend(withId);
const playerRow = playerSchema.extend(withId);
const matchRow = matchSchema.extend(withId);
const pathRow = pathSchema.extend({ ...withId, map: str.min(1).max(64) });

const issue = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join(', ');

/** Valid rows of a list; invalid ones are reported in `skipped`. */
function rows<T>(run: ImportRun, list: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>, label: (raw: Record<string, unknown>) => string): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const raw of list) {
    const parsed = schema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
    else run.skipped.push(`${label((raw ?? {}) as Record<string, unknown>)}: ${issue(parsed.error)}`);
  }
  return out;
}

function readSection(entries: Entries, section: TransferSection): Record<string, unknown> {
  const data = entries[`${section}.json`];
  if (!data) throw new TransferError(`${section}.json is missing in the file`);
  try {
    const value = JSON.parse(new TextDecoder().decode(data));
    if (typeof value !== 'object' || value === null) throw new Error();
    return value;
  } catch {
    throw new TransferError(`${section}.json is not valid JSON`);
  }
}

/** Updates entries with the same key, appends the others; returns the list and the counts. */
function upsert<T extends { id: string }>(existing: T[], incoming: T[], key: (item: T) => string = (item) => item.id) {
  const list = [...existing];
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const index = list.findIndex((e) => key(e) === key(item));
    if (index === -1) {
      list.push(item);
      added++;
    } else {
      list[index] = { ...item, id: list[index].id };
      updated++;
    }
  }
  return { list, added, updated };
}

function importTeams(run: ImportRun, data: Record<string, unknown>): string {
  const { store } = run.ctx;
  const teams = rows(run, data.teams, teamRow, (t) => `Team "${t.name ?? '?'}"`);
  const players = rows(run, data.players, playerRow, (p) => `Player "${p.username ?? '?'}"`);

  const finalTeams: TeamProfile[] = run.mode === 'replace' ? [] : [...store.list('teams')];
  let teamsAdded = 0;
  let teamsUpdated = 0;
  for (const team of teams) {
    // Same team = same id (exported from this PC) or the same name.
    const index = finalTeams.findIndex((t) => t.id === team.id || t.name.toLowerCase() === team.name.toLowerCase());
    const logo = run.uploads.map(team.logo) ?? (index === -1 ? null : finalTeams[index].logo);
    if (index === -1) {
      finalTeams.push({ ...team, logo });
      run.teamIds.set(team.id, team.id);
      teamsAdded++;
    } else {
      finalTeams[index] = { ...team, id: finalTeams[index].id, logo };
      run.teamIds.set(team.id, finalTeams[index].id);
      teamsUpdated++;
    }
  }
  run.teams = new Set(finalTeams.map((t) => t.id));

  const finalPlayers: PlayerProfile[] = run.mode === 'replace' ? [] : [...store.list('players')];
  let playersAdded = 0;
  let playersUpdated = 0;
  for (const player of players) {
    const teamId = player.teamId ? (run.teamIds.get(player.teamId) ?? (run.teams.has(player.teamId) ? player.teamId : null)) : null;
    const index = finalPlayers.findIndex((p) => p.steamid === player.steamid);
    const avatar = run.uploads.map(player.avatar) ?? (index === -1 ? null : finalPlayers[index].avatar);
    if (index === -1) {
      const id = finalPlayers.some((p) => p.id === player.id) ? randomUUID() : player.id;
      finalPlayers.push({ ...player, id, teamId, avatar });
      playersAdded++;
    } else {
      finalPlayers[index] = { ...player, id: finalPlayers[index].id, teamId, avatar };
      playersUpdated++;
    }
  }

  if (!run.dry) {
    store.replaceAll('teams', finalTeams);
    store.replaceAll('players', finalPlayers);
  }
  return `${counts(teams.length, 'team', teamsAdded, teamsUpdated)}, ${counts(players.length, 'player', playersAdded, playersUpdated)}${replaces(run, store.list('teams').length + store.list('players').length)}`;
}

function importMatches(run: ImportRun, data: Record<string, unknown>): string {
  const { store } = run.ctx;
  const team = (id: string | null) => (id ? (run.teamIds.get(id) ?? (run.teams.has(id) ? id : null)) : null);
  const matches: Match[] = rows(run, data.matches, matchRow, (m) => `Match "${m.title || m.id || '?'}"`).map((m) => ({
    ...m,
    left: { ...m.left, id: team(m.left.id) },
    right: { ...m.right, id: team(m.right.id) },
    vetos: m.vetos.map((v) => ({
      ...v,
      teamId: team(v.teamId),
      winner: team(v.winner),
      score: Object.fromEntries(Object.entries(v.score).flatMap(([id, rounds]) => (team(id) ? [[team(id)!, rounds]] : []))),
    })),
    captainVeto: null,
  }));
  const { list, added, updated } = upsert(run.mode === 'replace' ? [] : store.list('matches'), matches);
  // Only one current match: the imported one wins.
  const current = matches.find((m) => m.current)?.id;
  const final = current ? list.map((m) => ({ ...m, current: m.id === current })) : list;
  if (!run.dry) store.replaceAll('matches', final);
  return counts(matches.length, 'match', added, updated, 'matches') + replaces(run, store.list('matches').length);
}

function importHud(run: ImportRun, data: Record<string, unknown>): string {
  const { store } = run.ctx;
  const parts: string[] = [];
  const theme = themeSchema.safeParse(data.theme);
  if (theme.success) {
    const media = (items: { id: string; file: string; label: string }[]) =>
      items.flatMap((item) => {
        const file = run.uploads.map(item.file);
        return file ? [{ ...item, file }] : [];
      });
    const value = {
      ...theme.data,
      sponsors: media(theme.data.sponsors),
      backgroundVideos: media(theme.data.backgroundVideos),
      brandLogo: run.uploads.map(theme.data.brandLogo),
      tournamentLogo: run.uploads.map(theme.data.tournamentLogo),
    };
    if (!run.dry) store.setDoc('theme', value);
    parts.push(`theme with ${plural(value.sponsors.length, 'sponsor')}`);
  } else if (data.theme !== undefined) run.skipped.push(`Theme: ${issue(theme.error)}`);

  const config = hudConfigSchema.safeParse(data.hudConfig);
  if (config.success) {
    const { left, right } = config.data.sideBoxes;
    const value = {
      ...config.data,
      sideBoxes: { ...config.data.sideBoxes, left: { ...left, image: run.uploads.map(left.image) }, right: { ...right, image: run.uploads.map(right.image) } },
    };
    if (!run.dry) store.setDoc('hudConfig', value);
    parts.push('HUD elements');
  } else if (data.hudConfig !== undefined) run.skipped.push(`HUD elements: ${issue(config.error)}`);

  const scene = sceneSchema.pick({ auto: true, message: true }).safeParse(data.scene);
  if (scene.success) {
    if (!run.dry) store.setDoc('scene', { ...store.doc('scene'), ...scene.data });
    parts.push('scene text');
  }
  return parts.join(', ') || 'nothing';
}

function importHuds(run: ImportRun, data: Record<string, unknown>): string {
  const { store } = run.ctx;
  const huds = rows(run, data.huds, z.object({ dir: z.string().refine(isHudDir, 'Invalid folder'), name: z.string() }), (h) => `HUD "${h.name ?? '?'}"`);
  const panels = z.record(z.record(z.unknown())).safeParse(data.panels ?? {});
  const local = new Set(listHuds(store.dataDir).map((h) => h.dir));
  let added = 0;
  let updated = 0;
  const imported: string[] = [];
  for (const hud of huds) {
    const prefix = `huds/${hud.dir}/`;
    const files = Object.entries(run.entries)
      .filter(([name]) => name.startsWith(prefix) && !name.endsWith('/'))
      .map(([name, content]) => [name.slice(prefix.length), content] as [string, Uint8Array]);
    try {
      if (!run.dry) writeHudFiles(store.dataDir, hud.dir, files);
      else if (!files.some(([name]) => name === 'hud.json')) throw new HudImportError(`HUD ${hud.dir} has no hud.json`);
    } catch (error) {
      if (!(error instanceof HudImportError)) throw error;
      run.skipped.push(`HUD "${hud.name}": ${error.message}`);
      continue;
    }
    imported.push(hud.dir);
    if (local.has(hud.dir)) updated++;
    else added++;
  }
  const removed = run.mode === 'replace' ? [...local].filter((dir) => !imported.includes(dir)) : [];
  if (!run.dry) {
    removed.forEach((dir) => removeHud(store.dataDir, dir));
    const hudPanels = { ...store.doc('settings').hudPanels };
    removed.forEach((dir) => delete hudPanels[dir]);
    if (panels.success) for (const dir of imported) if (panels.data[dir]) hudPanels[dir] = panels.data[dir];
    store.setDoc('settings', { ...store.doc('settings'), hudPanels });
  }
  return counts(imported.length, 'HUD', added, updated) + (removed.length ? `, ${plural(removed.length, 'HUD')} removed` : '');
}

function importCamera(run: ImportRun, data: Record<string, unknown>): string {
  const { store } = run.ctx;
  const settings = store.doc('settings');
  const shots: CameraShot[] = rows(run, data.shots, shotSchema, (s) => `View "${s.name ?? '?'}"`);
  const shotResult = upsert(run.mode === 'replace' ? [] : settings.cameraShots, shots);
  const known = new Set(shotResult.list.map((s) => s.id));
  const paths: CameraPath[] = rows(run, data.paths, pathRow, (p) => `Camera path "${p.name ?? '?'}"`).filter((p) => {
    if (p.shotIds.every((id) => known.has(id))) return true;
    run.skipped.push(`Camera path "${p.name}": a view is missing`);
    return false;
  });
  const pathResult = upsert(run.mode === 'replace' ? [] : settings.cameraPaths, paths);
  run.pathIds = pathResult.list.map((p) => p.id);

  const options = z.object({ freeCameraOnMapLoad: z.boolean(), mapLoadCommands: commandText, menuCommands: commandText }).partial().safeParse(data);
  if (!run.dry) store.setDoc('settings', { ...store.doc('settings'), ...(options.success ? options.data : {}), cameraShots: shotResult.list, cameraPaths: pathResult.list });
  return `${counts(shots.length, 'view', shotResult.added, shotResult.updated)}, ${counts(paths.length, 'path', pathResult.added, pathResult.updated)}, console commands${replaces(run, settings.cameraShots.length + settings.cameraPaths.length)}`;
}

function importIntegrations(run: ImportRun, data: Record<string, unknown>): string {
  const { store, actions } = run.ctx;
  const settings = store.doc('settings');
  const parts: string[] = [];

  // The password stays on this PC.
  const obs = obsSchema.omit({ password: true }).safeParse(data.obs);
  let nextObs = settings.obs;
  if (obs.success) {
    nextObs = { ...obs.data, password: settings.obs.password };
    parts.push('OBS connection');
  } else if (data.obs !== undefined) run.skipped.push(`OBS: ${issue(obs.error)}`);

  // Camera paths imported in the same run are valid action targets already.
  const pathActions = run.pathIds.map((id) => ({ id: `camera-path-${id}` }) as TriggerAction);
  const signals: SignalRule[] = rows(run, data.signals, signalRuleSchema([...actions, ...pathActions]), (s) => `Signal ${s.event ?? '?'}`);
  const signalResult = upsert(run.mode === 'replace' ? [] : settings.signals, signals);
  parts.push(counts(signals.length, 'signal', signalResult.added, signalResult.updated));

  const keybinds: Record<string, string> = run.mode === 'replace' ? Object.fromEntries(Object.keys(settings.keybinds).map((id) => [id, ''])) : { ...settings.keybinds };
  let shortcuts = 0;
  const single = keybindsSchema(actions);
  for (const [id, accelerator] of Object.entries((data.keybinds ?? {}) as Record<string, unknown>)) {
    const parsed = single.safeParse({ [id]: accelerator });
    if (!parsed.success) {
      run.skipped.push(`Shortcut ${id}: ${issue(parsed.error)}`);
      continue;
    }
    const value = parsed.data[id];
    // A key can only trigger one action: the imported one wins.
    if (value) for (const [other, used] of Object.entries(keybinds)) if (other !== id && used.toLowerCase() === value.toLowerCase()) keybinds[other] = '';
    keybinds[id] = value;
    if (value) shortcuts++;
  }
  parts.push(plural(shortcuts, 'shortcut'));

  if (!run.dry) store.setDoc('settings', { ...store.doc('settings'), obs: nextObs, signals: signalResult.list.slice(0, 100), keybinds });
  return parts.join(', ');
}

const IMPORTERS: Record<TransferSection, (run: ImportRun, data: Record<string, unknown>) => string> = {
  teams: importTeams,
  matches: importMatches,
  hud: importHud,
  huds: importHuds,
  camera: importCamera,
  integrations: importIntegrations,
};

interface Pending {
  id: string;
  entries: Entries;
  manifest: Manifest;
  expires: number;
}

/** Keeps the last uploaded file between preview and import (one at a time; files can be large). */
export class SettingsTransfer {
  private pending: Pending | null = null;

  constructor(private readonly ctx: TransferContext) {}

  export(sections: TransferSection[], options: { appVersion: string | null; videos: boolean }) {
    return exportSettings(this.ctx, sections, options);
  }

  preview(zip: Uint8Array): TransferPreview {
    let entries: Entries;
    try {
      entries = unzipSync(zip);
    } catch {
      throw new TransferError('Not a valid zip file');
    }
    let manifest: Manifest;
    try {
      manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
    } catch {
      throw new TransferError('This is not a TacAM HUD export (manifest.json missing)');
    }
    if (manifest?.format !== FORMAT) throw new TransferError('This is not a TacAM HUD export');
    if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > FORMAT_VERSION) {
      throw new TransferError('The file comes from a newer TacAM HUD version – please update first');
    }
    manifest.sections = TRANSFER_SECTIONS.filter((s) => Array.isArray(manifest.sections) && manifest.sections.includes(s) && entries[`${s}.json`]);
    if (!manifest.sections.length) throw new TransferError('The file contains nothing to import');

    this.pending = { id: randomUUID(), entries, manifest, expires: Date.now() + PENDING_TTL };
    const result = this.run(this.pending, manifest.sections, 'merge', true);
    return {
      id: this.pending.id,
      appVersion: typeof manifest.appVersion === 'string' ? manifest.appVersion : null,
      createdAt: typeof manifest.createdAt === 'string' ? manifest.createdAt : null,
      sections: result.sections,
      files: Object.keys(entries).filter((name) => name.startsWith('uploads/')).length,
    };
  }

  /** Dry run with the chosen sections and mode (what "replace" would do). */
  check(id: string, sections: TransferSection[], mode: TransferMode): TransferResult {
    return this.run(this.take(id, false), sections, mode, true);
  }

  apply(id: string, sections: TransferSection[], mode: TransferMode): TransferResult {
    const pending = this.take(id, true);
    return this.run(pending, sections, mode, false);
  }

  private take(id: string, consume: boolean): Pending {
    const pending = this.pending;
    if (!pending || pending.id !== id || pending.expires < Date.now()) throw new TransferError('The file has expired – please choose it again');
    if (consume) this.pending = null;
    return pending;
  }

  private run(pending: Pending, sections: TransferSection[], mode: TransferMode, dry: boolean): TransferResult {
    const { store } = this.ctx;
    const run: ImportRun = {
      ctx: this.ctx,
      entries: pending.entries,
      mode,
      dry,
      uploads: new UploadImporter(pending.entries, this.ctx.uploadsDir, dry),
      skipped: [],
      teamIds: new Map(),
      teams: new Set(store.list('teams').map((t) => t.id)),
      pathIds: store.doc('settings').cameraPaths.map((p) => p.id),
    };
    const results: TransferSectionPreview[] = [];
    for (const section of TRANSFER_SECTIONS.filter((s) => sections.includes(s) && pending.manifest.sections.includes(s))) {
      results.push({ section, summary: IMPORTERS[section](run, readSection(pending.entries, section)) });
    }
    if (!dry) store.flush();
    return { sections: results, skipped: run.skipped };
  }
}
