import type { RoundRules } from './format.js';
import type { CaptainVeto } from './veto.js';

// Domain types shared between server, HUD and control panel.

export type Side = 'CT' | 'T';

// ---------------------------------------------------------------------------
// Database entities
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  id: string;
  steamid: string;
  username: string;
  firstName: string;
  lastName: string;
  country: string | null;
  /** File name inside the uploads directory, or null. */
  avatar: string | null;
  teamId: string | null;
  /** Coaches are filtered out of the data sent to the HUD. */
  isCoach: boolean;
  extra: Record<string, string>;
}

export interface TeamProfile {
  id: string;
  name: string;
  shortName: string;
  country: string | null;
  /** File name inside the uploads directory, or null. */
  logo: string | null;
  extra: Record<string, string>;
}

export type VetoType = 'ban' | 'pick' | 'decider';

export interface Veto {
  type: VetoType;
  mapName: string;
  /** Team that banned/picked the map, null for the decider. */
  teamId: string | null;
  /** Side chosen by the opponent of `teamId`. */
  side: Side | 'NO';
  /** Swap left/right orientation on this map. */
  reverseSide: boolean;
  /** Final rounds per team id once the map is played. */
  score: Record<string, number>;
  winner: string | null;
  mapEnd: boolean;
}

export type MatchType = 'bo1' | 'bo2' | 'bo3' | 'bo5';

export interface MatchTeam {
  id: string | null;
  wins: number;
}

export interface Match {
  id: string;
  left: MatchTeam;
  right: MatchTeam;
  matchType: MatchType;
  current: boolean;
  vetos: Veto[];
  /** Free text, e.g. "Upper Bracket Final". */
  title: string;
  /** ISO date-time string. */
  startTime: string | null;
  /** Rounds per half when the server differs from the game mode default (e.g. 1v1 on MR6); null = automatic. */
  roundsPerHalf: number | null;
  /** Running captain veto (links for the team captains), see veto.ts. */
  captainVeto: CaptainVeto | null;
}

// ---------------------------------------------------------------------------
// Theme (edited in the control panel, applied live by the HUD)
// ---------------------------------------------------------------------------

/** Theme colors; each key is applied to the HUD as the CSS variable `--color-<key>`. */
export const THEME_COLOR_KEYS = [
  'primary',
  'panel',
  'panel-strong',
  'ct',
  't',
  'money',
  'bomb',
  'defuse',
  'border',
  'text',
  'text-muted',
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** An uploaded image or video with a display label. */
export interface MediaItem {
  id: string;
  /** File name inside the uploads directory. */
  file: string;
  label: string;
}

export type Sponsor = MediaItem;

export interface Theme {
  colors: Record<ThemeColorKey, string>;
  borderRadius: number;
  fontFamily: string;
  sponsors: Sponsor[];
  /** Seconds each rotating sponsor is visible. */
  sponsorInterval: number;
  showSponsors: boolean;
  /** Static brand logo in the top right corner (upload file name). */
  brandLogo: string | null;
  showBrandLogo: boolean;
  /** Show the brand logo in grayscale (the TacAM look); off for colored logos. */
  brandLogoGrayscale: boolean;
  tournamentName: string;
  tournamentLogo: string | null;
  /** Videos played in random order behind the "starting soon" and BRB scenes. */
  backgroundVideos: MediaItem[];
}

export const DEFAULT_THEME: Theme = {
  colors: {
    primary: '#c13a3a',
    panel: 'rgba(47, 51, 56, 0.83)',
    'panel-strong': 'rgba(26, 58, 92, 0.85)',
    ct: 'rgba(26, 58, 92, 1)',
    t: 'rgba(193, 58, 58, 1)',
    money: '#4cf100',
    bomb: '#f22222',
    defuse: '#2222f2',
    border: 'rgba(255, 255, 255, 0.2)',
    text: 'rgba(250, 250, 250, 1)',
    'text-muted': 'rgba(191, 191, 191, 1)',
  },
  borderRadius: 5,
  fontFamily: 'Montserrat',
  sponsors: [],
  sponsorInterval: 10,
  showSponsors: true,
  brandLogo: null,
  showBrandLogo: true,
  brandLogoGrayscale: true,
  tournamentName: '',
  tournamentLogo: null,
  backgroundVideos: [],
};

// ---------------------------------------------------------------------------
// Broadcast scenes
// ---------------------------------------------------------------------------

export const SCENE_IDS = [
  'live',
  'starting',
  'brb',
  'pause',
  'halftime',
  'veto',
  'scoreboard',
  'matchEnd',
  'upcoming',
  'playerToWatch',
] as const;

export type SceneId = (typeof SCENE_IDS)[number];

/** Game events that can fire signals (apps/server/src/signals.ts). */
export const SIGNAL_EVENTS = [
  'roundStart',
  'roundLive',
  'roundEnd',
  'bombPlanted',
  'bombDefused',
  'bombExploded',
  'ace',
  'matchPoint',
  'timeout',
  'pause',
  'halftime',
  'matchEnd',
] as const;
export type SignalEvent = (typeof SIGNAL_EVENTS)[number];

export type SignalOutput =
  /** e.g. Bitfocus Companion: POST http://<companion>:8000/api/location/<page>/<row>/<column>/press */
  | { kind: 'http'; method: 'GET' | 'POST'; url: string }
  /** Any trigger action id (actions.ts), e.g. overlay-scoreboard. */
  | { kind: 'action'; action: string }
  | { kind: 'obsScene'; scene: string }
  | { kind: 'obsReplay' };

export interface SignalRule {
  id: string;
  enabled: boolean;
  event: SignalEvent;
  /** Only when the event belongs to this side/team (winner, planting team, ace player's team …); null = any. */
  filter: 'CT' | 'T' | 'left' | 'right' | null;
  output: SignalOutput;
  /** Seconds to wait before the output fires. */
  delay: number;
}

export interface SignalLogEntry {
  at: number;
  ruleId: string;
  event: SignalEvent;
  ok: boolean;
  message: string;
}

/** OBS connection via obs-websocket v5 (settings). */
export interface ObsSettings {
  enabled: boolean;
  /** e.g. ws://127.0.0.1:4455 */
  url: string;
  password: string;
  /** OBS program scene to switch to when a TacAM scene goes live. */
  sceneMap: Partial<Record<SceneId, string>>;
}

export interface ObsStatus {
  enabled: boolean;
  connected: boolean;
  error: string | null;
  /** Scenes in OBS, for the mapping UI. */
  scenes: string[];
}

/** Display names of the scenes (control panel, trigger URLs). */
export const SCENE_LABELS: Record<SceneId, string> = {
  live: 'Live HUD',
  starting: 'Starting Soon',
  brb: 'Be Right Back',
  pause: 'Technical pause',
  halftime: 'Halftime',
  veto: 'Map veto',
  scoreboard: 'Scoreboard',
  matchEnd: 'Match end',
  upcoming: 'Upcoming matches',
  playerToWatch: 'Player to Watch',
};

export interface SceneState {
  active: SceneId;
  /** Let the server switch scenes based on game phase (pause, halftime, game over). */
  auto: boolean;
  /** Headline shown on full-screen scenes. */
  message: string;
  /** Epoch ms for the "starting soon" countdown. */
  countdownTo: number | null;
}

export const DEFAULT_SCENE: SceneState = {
  active: 'live',
  auto: true,
  message: '',
  countdownTo: null,
};

// ---------------------------------------------------------------------------
// HUD runtime config (what JTs-Hud calls the "panel")
// ---------------------------------------------------------------------------

export interface SideBoxConfig {
  title: string;
  subtitle: string;
  image: string | null;
}

export const HUD_OVERLAYS = ['none', 'scoreboard', 'economy', 'comparison'] as const;
export type HudOverlay = (typeof HUD_OVERLAYS)[number];

export interface HudConfig {
  trivia: { title: string; content: string; visible: boolean };
  sideBoxes: { left: SideBoxConfig; right: SideBoxConfig; hidden: boolean };
  playerPreview: { steamid: string | null; visible: boolean };
  matchPreview: { matchId: string | null; visible: boolean };
  /** Swap the displayed sides (visual only). */
  swapTeams: boolean;
  /**
   * Keep each team on the HUD side it started the map on. CS2 always shows CT
   * on the left, so without this the teams change sides at halftime.
   */
  keepTeamSides: boolean;
  radar: { size: number; enlarged: boolean };
  /** Elements the producer can toggle individually. */
  visibility: {
    hud: boolean;
    radar: boolean;
    /**
     * Own kill feed. Off by default: with real CS2 data the game's kill feed is
     * used (`cl_draw_only_deathnotices 1`). The demo match always shows it.
     */
    killfeed: boolean;
    roundHistory: boolean;
    economy: boolean;
    sponsors: boolean;
  };
  /** Full-width overlay in the center of the live HUD (one at a time). */
  overlay: HudOverlay;
  /** SteamID64s of the two players in the comparison overlay. */
  comparison: { left: string | null; right: string | null };
  replaceAvatars: 'never' | 'if_missing' | 'always';
  /** SteamID64 of the player shown in the "player to watch" scene. */
  playerToWatch: string | null;
}

export const DEFAULT_HUD_CONFIG: HudConfig = {
  trivia: { title: '', content: '', visible: false },
  sideBoxes: {
    left: { title: '', subtitle: '', image: null },
    right: { title: '', subtitle: '', image: null },
    hidden: false,
  },
  playerPreview: { steamid: null, visible: false },
  matchPreview: { matchId: null, visible: false },
  swapTeams: false,
  keepTeamSides: false,
  radar: { size: 366, enlarged: false },
  visibility: {
    hud: true,
    radar: true,
    killfeed: false,
    roundHistory: true,
    economy: true,
    sponsors: true,
  },
  overlay: 'none',
  comparison: { left: null, right: null },
  replaceAvatars: 'never',
  playerToWatch: null,
};

// ---------------------------------------------------------------------------
// Live statistics computed by the server
// ---------------------------------------------------------------------------

export type BuyType = 'pistol' | 'eco' | 'semi' | 'force' | 'full';

export interface PlayerMatchStats {
  steamid: string;
  name: string;
  side: Side;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  roundsPlayed: number;
  kastRounds: number;
  /** Index = kills in a round (2..5). */
  multiKills: { 2: number; 3: number; 4: number; 5: number };
  openingKills: number;
  openingDeaths: number;
  clutchesWon: number;
  // derived
  adr: number;
  hsPercent: number;
  kast: number;
  kpr: number;
  rating: number;
}

export interface TeamEconomy {
  equipment: number;
  money: number;
  buy: BuyType;
}

export interface RoundRecord {
  /** 1-based round number. */
  round: number;
  winner: Side | null;
  outcome: string | null;
  bombPlanted: boolean;
  economy: { CT: TeamEconomy | null; T: TeamEconomy | null };
}

export interface StatsSnapshot {
  map: string | null;
  players: PlayerMatchStats[];
  rounds: RoundRecord[];
}

export interface KillFeedEntry {
  id: string;
  time: number;
  round: number;
  killer: { steamid: string; name: string; side: Side } | null;
  victim: { steamid: string; name: string; side: Side };
  assister: { steamid: string; name: string; side: Side } | null;
  weapon: string;
  headshot: boolean;
}

// ---------------------------------------------------------------------------
// Data the server attaches to every GSI update so the HUD can resolve
// player/team profiles without extra requests.
// ---------------------------------------------------------------------------

export interface HudPlayerExtension {
  id: string;
  name: string;
  steamid: string;
  realName: string | null;
  country: string | null;
  avatar: string | null;
  /** Database team, so scenes can show it without a running game. */
  teamId: string | null;
  extra: Record<string, string>;
}

export interface HudTeamExtension {
  id: string;
  name: string;
  shortName: string;
  country: string | null;
  logo: string | null;
  map_score: number;
  extra: Record<string, string>;
}

export interface HudBootstrap {
  config: HudConfig;
  theme: Theme;
  scene: SceneState;
  match: Match | null;
  teams: TeamProfile[];
  players: HudPlayerExtension[];
  stats: StatsSnapshot;
  /** Kills of the current round, so a reloaded HUD shows the full killfeed. */
  killfeed: KillFeedEntry[];
}

/** Socket.io events sent from server to HUD/control clients. */
export interface GsiUpdate {
  /** Raw CS2 GSI payload (coaches removed). */
  raw: unknown;
  /** Team profiles resolved for the current left/right orientation. */
  teams: { left: HudTeamExtension | null; right: HudTeamExtension | null };
  /** Data comes from the built-in demo match, not from CS2. */
  demo: boolean;
  /** Show left/right swapped so the teams keep their HUD side after halftime (`keepTeamSides`). */
  flip: boolean;
  /** Round rules of the current map (game mode + match override). */
  rules: RoundRules;
}

export interface LivePlayerSummary {
  steamid: string;
  name: string;
  side: Side;
  observerSlot: number | null;
  kills: number;
  deaths: number;
  assists: number;
  health: number;
  money: number;
  /** Profile id if the player exists in the database. */
  profileId: string | null;
  teamId: string | null;
}

export interface LiveSummary {
  map: string;
  mapPhase: string;
  roundPhase: string | null;
  round: number;
  /** `gsiName`: team name as sent by the game server (mp_teamname), null when CS2 sends none. */
  left: { name: string; gsiName: string | null; side: Side; score: number; teamId: string | null };
  right: { name: string; gsiName: string | null; side: Side; score: number; teamId: string | null };
  players: LivePlayerSummary[];
  observed: string | null;
}

export interface ServerToClientEvents {
  update: (payload: GsiUpdate) => void;
  live: (summary: LiveSummary | null) => void;
  bootstrap: (data: HudBootstrap) => void;
  config: (config: HudConfig) => void;
  theme: (theme: Theme) => void;
  scene: (scene: SceneState) => void;
  match: (match: Match | null) => void;
  teams: (teams: TeamProfile[]) => void;
  players: (players: HudPlayerExtension[]) => void;
  stats: (stats: StatsSnapshot) => void;
  kill: (entry: KillFeedEntry) => void;
  action: (action: HudAction) => void;
  refresh: () => void;
  gsiStatus: (status: GsiStatus) => void;
}

export interface ClientToServerEvents {
  hello: (role: 'hud' | 'control') => void;
}

export type HudAction =
  | { type: 'radarBigger' }
  | { type: 'radarSmaller' }
  | { type: 'toggleRadarView' }
  | { type: 'toggleHud' };

export interface GsiStatus {
  connected: boolean;
  lastUpdate: number | null;
  map: string | null;
  phase: string | null;
}
