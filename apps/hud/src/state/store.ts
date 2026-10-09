import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CSGOGSI, type CSGO, type CSGORaw, type PlayerExtension } from 'csgogsi';
import {
  DEFAULT_HUD_CONFIG,
  DEFAULT_SCENE,
  DEFAULT_THEME,
  type ClientToServerEvents,
  type HudAction,
  type HudBootstrap,
  type HudConfig,
  type HudPlayerExtension,
  type KillFeedEntry,
  type Match,
  type SceneState,
  type ServerToClientEvents,
  type StatsSnapshot,
  type TeamProfile,
  type Theme,
} from '@tacam/shared';

export interface HudState {
  game: CSGO | null;
  config: HudConfig;
  theme: Theme;
  scene: SceneState;
  match: Match | null;
  teams: TeamProfile[];
  players: HudPlayerExtension[];
  stats: StatsSnapshot;
  killfeed: KillFeedEntry[];
  connected: boolean;
}

/** Shared csgogsi instance; components can subscribe to its events (roundEnd, bombPlant, …). */
export const GSI = new CSGOGSI();
// CS2 premier/competitive: MR12 with MR3 overtime (csgogsi defaults to the old MR15).
GSI.regulationMR = 12;
GSI.overtimeMR = 3;

let state: HudState = {
  game: null,
  config: DEFAULT_HUD_CONFIG,
  theme: DEFAULT_THEME,
  scene: DEFAULT_SCENE,
  match: null,
  teams: [],
  players: [],
  stats: { map: null, players: [], rounds: [] },
  killfeed: [],
  connected: false,
};

const listeners = new Set<() => void>();
const set = (patch: Partial<HudState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};

export function useHud<T>(selector: (s: HudState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state)
  );
}

export const getHudState = () => state;

// --- HUD actions (keybinds / control panel buttons) ------------------------

type ActionListener = (action: HudAction) => void;
const actionListeners = new Set<ActionListener>();
export const onAction = (listener: ActionListener) => {
  actionListeners.add(listener);
  return () => {
    actionListeners.delete(listener);
  };
};

// --- connection --------------------------------------------------------------

const token = new URLSearchParams(window.location.search).get('token') ?? undefined;
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ auth: { token } });

async function bootstrap() {
  const res = await fetch('/api/bootstrap', { headers: token ? { 'x-tacam-token': token } : {} });
  if (!res.ok) return;
  const data = (await res.json()) as HudBootstrap;
  GSI.players = data.players as PlayerExtension[];
  set({ ...data });
}

socket.on('connect', () => {
  socket.emit('hello', 'hud');
  set({ connected: true });
  void bootstrap();
});
socket.on('disconnect', () => set({ connected: false }));

socket.on('update', ({ raw, teams }) => {
  GSI.teams.left = teams.left;
  GSI.teams.right = teams.right;
  const game = GSI.digest(raw as CSGORaw);
  if (game) set({ game });
});

socket.on('kill', (entry) => set({ killfeed: [...state.killfeed.slice(-7), entry] }));
socket.on('stats', (stats) => set({ stats }));
socket.on('config', (config) => set({ config }));
socket.on('theme', (theme) => set({ theme }));
socket.on('scene', (scene) => set({ scene }));
socket.on('match', (match) => set({ match }));
socket.on('teams', (teams) => set({ teams }));
socket.on('players', (players) => {
  GSI.players = players as PlayerExtension[];
  set({ players });
});
socket.on('action', (action) => {
  for (const listener of actionListeners) listener(action);
});
socket.on('refresh', () => window.location.reload());

// The theme editor previews unsaved themes by posting them into its HUD iframe.
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'tacam:theme-preview' && event.data.theme) set({ theme: event.data.theme as Theme });
});

// Clear the killfeed when a new round starts.
GSI.on('freezetimeStart', () => set({ killfeed: [] }));
