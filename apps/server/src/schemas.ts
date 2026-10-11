import { z } from 'zod';
import { HUD_OVERLAYS, SCENE_IDS, SIGNAL_EVENTS, THEME_COLOR_KEYS } from '@tacam/shared';
import { isAccelerator, type TriggerAction } from './actions.js';

/** Zod schemas shared by the REST API (api.ts) and the settings import (transfer.ts). */

export const str = z.string().trim();
export const nullableStr = z.string().trim().nullable();

export const playerSchema = z.object({
  steamid: str.regex(/^\d{17}$/, 'SteamID64 must have 17 digits'),
  username: str.min(1),
  firstName: str.default(''),
  lastName: str.default(''),
  country: nullableStr.default(null),
  avatar: nullableStr.default(null),
  teamId: nullableStr.default(null),
  isCoach: z.boolean().default(false),
  extra: z.record(z.string()).default({}),
});

export const teamSchema = z.object({
  name: str.min(1),
  shortName: str.default(''),
  country: nullableStr.default(null),
  logo: nullableStr.default(null),
  extra: z.record(z.string()).default({}),
});

export const side = z.enum(['CT', 'T']);
export const vetoSchema = z.object({
  type: z.enum(['ban', 'pick', 'decider']),
  mapName: str.min(1),
  teamId: nullableStr.default(null),
  side: z.union([side, z.literal('NO')]).default('NO'),
  reverseSide: z.boolean().default(false),
  score: z.record(z.number().int().min(0)).default({}),
  winner: nullableStr.default(null),
  mapEnd: z.boolean().default(false),
});

export const matchSchema = z.object({
  left: z.object({ id: nullableStr, wins: z.number().int().min(0).default(0) }),
  right: z.object({ id: nullableStr, wins: z.number().int().min(0).default(0) }),
  matchType: z.enum(['bo1', 'bo2', 'bo3', 'bo5']),
  current: z.boolean().default(false),
  vetos: z.array(vetoSchema).default([]),
  title: str.default(''),
  startTime: nullableStr.default(null),
  roundsPerHalf: z.number().int().min(1).max(30).nullable().default(null),
});

export const sideBox = z.object({ title: z.string(), subtitle: z.string(), image: nullableStr });
export const hudConfigSchema = z.object({
  trivia: z.object({ title: z.string(), content: z.string(), visible: z.boolean() }),
  sideBoxes: z.object({ left: sideBox, right: sideBox, hidden: z.boolean() }),
  playerPreview: z.object({ steamid: nullableStr, visible: z.boolean() }),
  matchPreview: z.object({ matchId: nullableStr, visible: z.boolean() }),
  swapTeams: z.boolean(),
  keepTeamSides: z.boolean(),
  overlay: z.enum(HUD_OVERLAYS),
  comparison: z.object({ left: nullableStr, right: nullableStr }),
  radar: z.object({ size: z.number().min(150).max(900), enlarged: z.boolean() }),
  visibility: z.object({
    hud: z.boolean(),
    radar: z.boolean(),
    killfeed: z.boolean(),
    roundHistory: z.boolean(),
    economy: z.boolean(),
    sponsors: z.boolean(),
    prediction: z.boolean(),
  }),
  replaceAvatars: z.enum(['never', 'if_missing', 'always']),
  playerToWatch: z.string().regex(/^\d{17}$/).nullable(),
});

// Colors end up in CSS custom properties: allow only color syntax, nothing that could break out.
export const cssColor = z.string().regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/, 'Invalid color');
export const themeSchema = z.object({
  colors: z.object(Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, cssColor])) as Record<(typeof THEME_COLOR_KEYS)[number], typeof cssColor>),
  borderRadius: z.number().min(0).max(30),
  fontFamily: z.string().regex(/^[\w\s-]{1,40}$/),
  sponsors: z.array(z.object({ id: z.string(), file: z.string(), label: z.string() })),
  sponsorInterval: z.number().min(2).max(120),
  showSponsors: z.boolean(),
  brandLogo: nullableStr,
  showBrandLogo: z.boolean(),
  brandLogoGrayscale: z.boolean(),
  tournamentName: z.string().max(80),
  tournamentLogo: nullableStr,
  backgroundVideos: z.array(z.object({ id: z.string(), file: z.string(), label: z.string() })),
});

export const sceneSchema = z.object({
  active: z.enum(SCENE_IDS),
  auto: z.boolean(),
  message: z.string().max(200),
  countdownTo: z.number().nullable(),
});

export const commandText = z
  .string()
  .max(4000)
  .refine((text) => text.split(/\r?\n/).every((line) => line.length <= 300), 'A command line is too long');

export const pathSchema = z.object({ name: str.min(1).max(60), shotIds: z.array(str).min(2).max(20), duration: z.number().min(0.5).max(120), hold: z.boolean() });

const finite = z.number().finite();
export const shotSchema = z.object({
  id: str.min(1).max(64),
  name: str.min(1).max(60),
  map: str.min(1).max(64),
  x: finite,
  y: finite,
  z: finite,
  pitch: finite,
  yaw: finite,
  roll: finite,
  fov: z.number().min(1).max(179),
});

export const obsSchema = z.object({
  enabled: z.boolean(),
  url: z.string().regex(/^wss?:\/\/[^\s]+$/, 'URL must start with ws:// or wss://'),
  password: z.string().max(200),
  sceneMap: z.record(z.enum(SCENE_IDS), z.string().max(200)),
});

/** Signal rules; actions are checked against the current action list (camera paths add actions at runtime). */
export const signalRuleSchema = (actions: TriggerAction[]) =>
  z.object({
    id: str.min(1).max(64),
    enabled: z.boolean(),
    event: z.enum(SIGNAL_EVENTS),
    filter: z.enum(['CT', 'T', 'left', 'right']).nullable(),
    output: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('http'), method: z.enum(['GET', 'POST']), url: z.string().url('Invalid URL').regex(/^https?:/, 'Only http(s) URLs') }),
      z.object({ kind: z.literal('action'), action: z.string().refine((id) => actions.some((a) => a.id === id), 'Unknown action') }),
      z.object({ kind: z.literal('obsScene'), scene: str.min(1) }),
      z.object({ kind: z.literal('obsReplay') }),
    ]),
    delay: z.number().min(0).max(60),
  });

export const keybindsSchema = (actions: TriggerAction[]) => {
  const ids = new Set(actions.map((a) => a.id));
  return z.record(z.string().refine((id) => ids.has(id), 'Unknown action'), z.string().refine((v) => v === '' || isAccelerator(v), 'Invalid shortcut'));
};
