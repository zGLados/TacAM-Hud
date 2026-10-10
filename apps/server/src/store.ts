import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  DEFAULT_HUD_CONFIG,
  DEFAULT_SCENE,
  DEFAULT_THEME,
  type HudConfig,
  type Match,
  type PlayerProfile,
  type SceneState,
  type TeamProfile,
  type Theme,
} from '@tacam/shared';

export interface Settings {
  steamPath: string | null;
  gsiToken: string;
  /** Allow the control panel / HUD to be reached from other devices in the LAN. */
  lanAccess: boolean;
  /** PIN required for non-local access. Empty = no LAN access allowed. */
  accessPin: string;
  telnet: { host: string; port: number };
  /** Default sponsors/brand logo were copied into uploads (see defaultMedia.ts). */
  defaultMediaSeeded: boolean;
}

interface Database {
  players: PlayerProfile[];
  teams: TeamProfile[];
  matches: Match[];
  settings: Settings;
  hudConfig: HudConfig;
  theme: Theme;
  scene: SceneState;
}

const defaults = (): Database => ({
  players: [],
  teams: [],
  matches: [],
  settings: {
    steamPath: null,
    gsiToken: randomUUID().replace(/-/g, ''),
    lanAccess: false,
    accessPin: '',
    telnet: { host: '127.0.0.1', port: 2020 },
    defaultMediaSeeded: false,
  },
  hudConfig: DEFAULT_HUD_CONFIG,
  theme: DEFAULT_THEME,
  scene: DEFAULT_SCENE,
});

/** Deep-merges stored objects over defaults so new fields get sane values after updates. */
function mergeDefaults<T>(base: T, stored: unknown): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return (stored === undefined ? base : stored) as T;
  }
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return base;
  const out: Record<string, unknown> = { ...(stored as Record<string, unknown>) };
  for (const [key, value] of Object.entries(base as Record<string, unknown>)) {
    out[key] = mergeDefaults(value, (stored as Record<string, unknown>)[key]);
  }
  return out as T;
}

type CollectionName = 'players' | 'teams' | 'matches';
type DocumentName = 'settings' | 'hudConfig' | 'theme' | 'scene';

/**
 * Small JSON file database. The data set (a few hundred players/teams) is tiny,
 * so keeping everything in memory and writing atomically is simpler and more
 * portable than a native SQLite module inside Electron.
 */
export class Store extends EventEmitter {
  private data: Database;
  private writeTimer: NodeJS.Timeout | null = null;
  readonly file: string;

  constructor(readonly dataDir: string) {
    super();
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'db.json');
    this.data = this.load();
  }

  private load(): Database {
    if (!fs.existsSync(this.file)) {
      const fresh = defaults();
      this.data = fresh;
      this.flush();
      return fresh;
    }
    const stored = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    return mergeDefaults(defaults(), stored);
  }

  flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  private persist() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => this.flush(), 200);
  }

  // --- collections -------------------------------------------------------

  list<K extends CollectionName>(name: K): Database[K] {
    return this.data[name];
  }

  get<K extends CollectionName>(name: K, id: string): Database[K][number] | undefined {
    return (this.data[name] as { id: string }[]).find((e) => e.id === id) as
      | Database[K][number]
      | undefined;
  }

  insert<K extends CollectionName>(name: K, entity: Omit<Database[K][number], 'id'>) {
    const created = { ...entity, id: randomUUID() } as Database[K][number];
    (this.data[name] as unknown[]).push(created);
    this.changed(name);
    return created;
  }

  update<K extends CollectionName>(name: K, id: string, patch: Partial<Database[K][number]>) {
    const list = this.data[name] as { id: string }[];
    const index = list.findIndex((e) => e.id === id);
    if (index === -1) return undefined;
    list[index] = { ...list[index], ...patch, id };
    this.changed(name);
    return list[index] as Database[K][number];
  }

  remove(name: CollectionName, id: string) {
    const list = this.data[name] as { id: string }[];
    const index = list.findIndex((e) => e.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    this.changed(name);
    return true;
  }

  /** Replace a whole collection, used by matches to keep a single "current" match. */
  replaceAll<K extends CollectionName>(name: K, entities: Database[K]) {
    this.data[name] = entities;
    this.changed(name);
  }

  // --- single documents --------------------------------------------------

  doc<K extends DocumentName>(name: K): Database[K] {
    return this.data[name];
  }

  setDoc<K extends DocumentName>(name: K, value: Database[K]) {
    this.data[name] = value;
    this.changed(name);
    return value;
  }

  private changed(name: CollectionName | DocumentName) {
    this.persist();
    this.emit('change', name);
  }
}
