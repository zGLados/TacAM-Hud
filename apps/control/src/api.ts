import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  GsiStatus,
  HudAction,
  HudConfig,
  LiveSummary,
  Match,
  PlayerProfile,
  SceneState,
  ServerToClientEvents,
  StatsSnapshot,
  TeamProfile,
  Theme,
  ObsSettings,
  ObsStatus,
  SignalLogEntry,
  SignalRule,
} from '@tacam/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers:
      body instanceof FormData || body === undefined ? undefined : body instanceof Blob ? { 'content-type': 'application/zip' } : { 'content-type': 'application/json' },
    body: body instanceof FormData || body instanceof Blob ? body : body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

export interface Settings {
  steamPath: string | null;
  gsiToken: string;
  lanAccess: boolean;
  accessPin: string;
  telnet: { host: string; port: number };
  launchOptions: string;
  launchMode: 'normal' | 'tools' | 'hlae';
  hlaePath: string;
  launchBorderless: boolean;
  actionKey: string;
  keybinds: Record<string, string>;
  obs: ObsSettings;
  signals: SignalRule[];
  gsiPort: number;
  cs2CfgDir: string | null;
  gsiInstalled: boolean;
  addresses: string[];
}

/** CS2 console bridge state (apps/server/src/game.ts). */
export interface GameConsoleStatus {
  host: string;
  port: number;
  connected: boolean;
  error: string | null;
  lines: { at: number; text: string }[];
}

export interface HlaeStatus {
  installed: { version: string | null; path: string } | null;
  latest: { version: string } | null;
  error: string | null;
  supported: boolean;
}

export interface ConsoleDiagnosis {
  supported: boolean;
  cs2Running: boolean;
  commandLine: string | null;
  netconPort: number | null;
  listening: string[];
}

/** Imported HUD (apps/server/src/huds.ts). */
export interface ImportedHud {
  dir: string;
  name: string;
  version: string;
  author: string;
  thumb: string | null;
  hasPanel: boolean;
  hasKeybinds: boolean;
}
export interface HudPanelInput {
  type: string;
  name: string;
  label?: string;
  values?: { name: string; label: string }[];
}
export type HudPanelValues = Record<string, Record<string, string | boolean | number | null>>;
export interface HudPanelData {
  panel: { name: string; label?: string; inputs: HudPanelInput[] }[];
  keybinds: { bind?: string; action: string; label?: string }[];
  values: HudPanelValues;
}

/** Quick setup: an existing team or a new one by name. */
export type QuickTeam = { teamId: string } | { name: string; shortName: string };

/** A trigger URL action, see apps/server/src/actions.ts. */
export interface TriggerActionInfo {
  id: string;
  group: string;
  label: string;
  /** Has an on/off state for button feedback (/api/trigger-status/<id>). */
  hasState: boolean;
}

export type PlayerInput = Omit<PlayerProfile, 'id'>;
export type TeamInput = Omit<TeamProfile, 'id'>;
export type MatchInput = Omit<Match, 'id' | 'captainVeto'>;

export const api = {
  auth: {
    status: () => request<{ authorized: boolean; local: boolean }>('GET', '/auth/status'),
    login: (pin: string) => request<{ ok: boolean }>('POST', '/auth/login', { pin }),
  },
  players: {
    list: () => request<PlayerProfile[]>('GET', '/players'),
    create: (p: PlayerInput) => request<PlayerProfile>('POST', '/players', p),
    update: (id: string, p: PlayerInput) => request<PlayerProfile>('PUT', `/players/${id}`, p),
    remove: (id: string) => request<void>('DELETE', `/players/${id}`),
    import: (rows: PlayerInput[]) => request<{ created: number; updated: number }>('POST', '/players/import', rows),
  },
  teams: {
    list: () => request<TeamProfile[]>('GET', '/teams'),
    create: (t: TeamInput) => request<TeamProfile>('POST', '/teams', t),
    update: (id: string, t: TeamInput) => request<TeamProfile>('PUT', `/teams/${id}`, t),
    remove: (id: string) => request<void>('DELETE', `/teams/${id}`),
    import: (rows: { name: string; shortName: string; country: string | null }[]) =>
      request<{ created: number; updated: number }>('POST', '/teams/import', rows),
  },
  live: {
    quickSetup: (body: { left: QuickTeam; right: QuickTeam; reassign: boolean; setMatch: boolean }) =>
      request<{ created: number; updated: number }>('POST', '/live/quick-setup', body),
  },
  matches: {
    list: () => request<Match[]>('GET', '/matches'),
    create: (m: MatchInput) => request<Match>('POST', '/matches', m),
    update: (id: string, m: MatchInput) => request<Match>('PUT', `/matches/${id}`, m),
    remove: (id: string) => request<void>('DELETE', `/matches/${id}`),
    toggleCurrent: (id: string) => request<Match>('POST', `/matches/${id}/current`),
    reverseCurrentMap: (id: string) => request<Match>('POST', `/matches/${id}/reverse-current-map`),
    startCaptainVeto: (id: string, options: { first: 'left' | 'right'; sideChoice: boolean; pool: string[] }) =>
      request<Match>('POST', `/matches/${id}/captain-veto`, options),
    stopCaptainVeto: (id: string) => request<Match>('DELETE', `/matches/${id}/captain-veto`),
  },
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ file: string; url: string }>('POST', '/uploads', form);
  },
  game: {
    launch: () => request<{ ok: boolean; args: string[] }>('POST', '/game/launch'),
    console: (connect = false) => request<GameConsoleStatus>('GET', `/game/console${connect ? '?connect=1' : ''}`),
    send: (command: string) => request<{ lines: string[] }>('POST', '/game/console', { command }),
    diagnose: () => request<ConsoleDiagnosis>('GET', '/game/console/diagnose'),
  },
  hlae: {
    status: (check = false) => request<HlaeStatus>('GET', `/hlae${check ? '?check=1' : ''}`),
    install: () => request<{ version: string | null; path: string }>('POST', '/hlae/install'),
  },
  huds: {
    list: () => request<ImportedHud[]>('GET', '/huds'),
    import: (file: File) => request<ImportedHud>('POST', '/huds/import', file),
    remove: (dir: string) => request<void>('DELETE', `/huds/${dir}`),
    panel: (dir: string) => request<HudPanelData>('GET', `/huds/${dir}/panel`),
    savePanel: (dir: string, values: HudPanelValues) => request<HudPanelValues>('PUT', `/huds/${dir}/panel`, values),
    action: (dir: string, action: string, data?: string) => request<void>('POST', `/huds/${dir}/action`, { action, data }),
    keybind: (dir: string, action: string) => request<void>('POST', `/huds/${dir}/keybind`, { action }),
  },
  uploadVideo: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ file: string; url: string }>('POST', '/uploads/video', form);
  },
  hud: {
    config: () => request<HudConfig>('GET', '/hud/config'),
    saveConfig: (c: HudConfig) => request<HudConfig>('PUT', '/hud/config', c),
    action: (type: HudAction['type']) => request<void>('POST', '/hud/action', { type }),
    refresh: () => request<void>('POST', '/hud/refresh'),
  },
  theme: {
    get: () => request<Theme>('GET', '/theme'),
    save: (t: Theme) => request<Theme>('PUT', '/theme', t),
  },
  scene: {
    get: () => request<SceneState>('GET', '/scene'),
    save: (s: SceneState) => request<SceneState>('PUT', '/scene', s),
  },
  stats: {
    get: () => request<StatsSnapshot>('GET', '/stats'),
    reset: () => request<StatsSnapshot>('POST', '/stats/reset'),
  },
  settings: {
    get: () => request<Settings>('GET', '/settings'),
    save: (s: Pick<Settings, 'steamPath' | 'lanAccess' | 'accessPin' | 'telnet' | 'launchOptions' | 'launchMode' | 'hlaePath' | 'launchBorderless'>) => request<Settings>('PUT', '/settings', s),
    installGsi: () => request<{ file: string }>('POST', '/settings/install-gsi'),
    newActionKey: () => request<{ actionKey: string }>('POST', '/settings/action-key'),
    saveKeybinds: (keybinds: Record<string, string>) => request<Record<string, string>>('PUT', '/settings/keybinds', keybinds),
    saveObs: (obs: ObsSettings) => request<ObsSettings>('PUT', '/settings/obs', obs),
    saveSignals: (signals: SignalRule[]) => request<SignalRule[]>('PUT', '/settings/signals', signals),
    obsStatus: () => request<ObsStatus>('GET', '/obs'),
  },
  signals: {
    log: () => request<SignalLogEntry[]>('GET', '/signals/log'),
    test: (rule: SignalRule) => request<{ ok: boolean; message: string }>('POST', '/signals/test', rule),
  },
  actions: {
    list: () => request<TriggerActionInfo[]>('GET', '/actions'),
  },
  demo: {
    status: () => request<{ running: boolean }>('GET', '/demo'),
    start: () => request<{ running: boolean }>('POST', '/demo/start'),
    stop: () => request<{ running: boolean }>('POST', '/demo/stop'),
    seed: () => request<Match>('POST', '/demo/seed'),
  },
};

export const uploadUrl = (file: string | null | undefined) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

// --- realtime ---------------------------------------------------------------

interface LiveState {
  connected: boolean;
  status: GsiStatus | null;
  summary: LiveSummary | null;
  stats: StatsSnapshot | null;
  scene: SceneState | null;
  config: HudConfig | null;
  /** Bumped whenever players/teams/matches change on the server. */
  dataVersion: number;
}

let live: LiveState = { connected: false, status: null, summary: null, stats: null, scene: null, config: null, dataVersion: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<LiveState>) => {
  live = { ...live, ...patch };
  listeners.forEach((l) => l());
};

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function connectLive() {
  if (socket) return;
  socket = io();
  socket.on('connect', () => {
    socket!.emit('hello', 'control');
    set({ connected: true });
    api.stats.get().then((stats) => set({ stats })).catch(() => {});
    api.scene.get().then((scene) => set({ scene })).catch(() => {});
    api.hud.config().then((config) => set({ config })).catch(() => {});
  });
  socket.on('disconnect', () => set({ connected: false }));
  socket.on('gsiStatus', (status) => set({ status }));
  socket.on('live', (summary) => set({ summary }));
  socket.on('stats', (stats) => set({ stats }));
  socket.on('scene', (scene) => set({ scene }));
  socket.on('config', (config) => set({ config }));
  const bump = () => set({ dataVersion: live.dataVersion + 1 });
  socket.on('players', bump);
  socket.on('teams', bump);
  socket.on('match', bump);
}

export function useLive<T>(selector: (s: LiveState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(live)
  );
}

/** Loads data and reloads it whenever the server reports changed players/teams/matches. */
export function useData<T>(loader: () => Promise<T>, initial: T) {
  const version = useLive((s) => s.dataVersion);
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    loader()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(reload, [reload, version]);
  return { data, setData, error, reload };
}
