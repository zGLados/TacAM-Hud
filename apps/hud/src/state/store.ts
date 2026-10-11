import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CSGOGSI, type CSGO, type CSGORaw, type PlayerExtension } from 'csgogsi';
import {
  type CameraState,
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
  /** Data comes from the demo match (shows the own kill feed). */
  demo: boolean;
  /** Server says: show left/right swapped (keep team sides after halftime). */
  flip: boolean;
  /** HLAE free camera / view / path: no player is spectated, see focusedPlayer. */
  camera: CameraState;
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
  camera: { mode: 'game', autoDirector: false },
  connected: false,
  demo: false,
  flip: false,
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

/** The spectated player – none while TacAM runs a HLAE free camera, saved view or camera path. */
export const focusedPlayer = (s: HudState) => (s.camera.mode === 'game' ? (s.game?.player ?? null) : null);

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

/**
 * OBS keeps a browser source loaded across TacAM updates: the socket reconnects,
 * but the old HUD code keeps running (and misses new events). The built
 * index.html references hashed bundles, so different script URLs = new version.
 */
const scriptUrls = (doc: Document) =>
  [...doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map((s) => new URL(s.getAttribute('src')!, window.location.href).pathname).sort().join(' ');
async function reloadIfOutdated() {
  try {
    const res = await fetch(window.location.pathname, { cache: 'no-store' });
    if (!res.ok) return;
    const served = scriptUrls(new DOMParser().parseFromString(await res.text(), 'text/html'));
    if (served && served !== scriptUrls(document)) window.location.reload();
  } catch {
    // server restarting – the next reconnect checks again
  }
}

let connectedBefore = false;
socket.on('connect', () => {
  socket.emit('hello', 'hud');
  set({ connected: true });
  if (connectedBefore) void reloadIfOutdated();
  connectedBefore = true;
  void bootstrap();
});
socket.on('disconnect', () => set({ connected: false }));

socket.on('update', ({ raw, teams, demo, flip, rules }) => {
  GSI.regulationMR = rules.regulationMR;
  GSI.overtimeMR = rules.overtimeMR;
  GSI.teams.left = teams.left;
  GSI.teams.right = teams.right;
  const game = GSI.digest(raw as CSGORaw);
  if (game) set({ game, demo, flip });
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
socket.on('camera', (camera) => set({ camera }));

// The theme editor previews unsaved themes by posting them into its HUD iframe.
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'tacam:theme-preview' && event.data.theme) set({ theme: event.data.theme as Theme });
});

// Clear the killfeed when a new round starts.
GSI.on('freezetimeStart', () => set({ killfeed: [] }));
