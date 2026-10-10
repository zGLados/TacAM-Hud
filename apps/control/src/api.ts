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
    headers: body instanceof FormData || body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
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
  actionKey: string;
  keybinds: Record<string, string>;
  gsiPort: number;
  cs2CfgDir: string | null;
  gsiInstalled: boolean;
  addresses: string[];
}

/** A trigger URL action, see apps/server/src/actions.ts. */
export interface TriggerActionInfo {
  id: string;
  group: string;
  label: string;
}

export type PlayerInput = Omit<PlayerProfile, 'id'>;
export type TeamInput = Omit<TeamProfile, 'id'>;
export type MatchInput = Omit<Match, 'id'>;

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
  },
  matches: {
    list: () => request<Match[]>('GET', '/matches'),
    create: (m: MatchInput) => request<Match>('POST', '/matches', m),
    update: (id: string, m: MatchInput) => request<Match>('PUT', `/matches/${id}`, m),
    remove: (id: string) => request<void>('DELETE', `/matches/${id}`),
    toggleCurrent: (id: string) => request<Match>('POST', `/matches/${id}/current`),
    reverseCurrentMap: (id: string) => request<Match>('POST', `/matches/${id}/reverse-current-map`),
  },
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ file: string; url: string }>('POST', '/uploads', form);
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
    save: (s: Pick<Settings, 'steamPath' | 'lanAccess' | 'accessPin' | 'telnet'>) => request<Settings>('PUT', '/settings', s),
    installGsi: () => request<{ file: string }>('POST', '/settings/install-gsi'),
    newActionKey: () => request<{ actionKey: string }>('POST', '/settings/action-key'),
    saveKeybinds: (keybinds: Record<string, string>) => request<Record<string, string>>('PUT', '/settings/keybinds', keybinds),
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
