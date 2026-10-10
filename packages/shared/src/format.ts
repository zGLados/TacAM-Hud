/** "1:05" style countdown from seconds. */
export function formatClock(seconds: number | string): string {
  const total = Math.abs(Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

/** "Round 5/24" in regulation, "OT 2 (3/6)" in overtime. Takes map.round (0-based). */
export function formatRoundLabel(mapRound: number, regulationMR = 12, overtimeMR = 3): string {
  const round = mapRound + 1;
  const regulation = regulationMR * 2;
  if (round <= regulation) return `Round ${round}/${regulation}`;
  const otRound = round - regulation;
  const otLength = overtimeMR * 2;
  const ot = Math.ceil(otRound / otLength);
  return `OT ${ot} (${otRound - (ot - 1) * otLength}/${otLength})`;
}

export interface RoundRules {
  /** Rounds per half in regulation (CS2 competitive: 12, wingman: 8). */
  regulationMR: number;
  /** Rounds per overtime half. */
  overtimeMR: number;
}

/**
 * Round rules for a GSI game mode. `override` (rounds per half, from the match)
 * covers custom servers, e.g. 1v1/2v2 setups running in competitive mode.
 */
export function roundRules(mode: string | undefined, override?: number | null): RoundRules {
  const regulationMR = override || (mode === 'scrimcomp2v2' ? 8 : 12);
  return { regulationMR, overtimeMR: 3 };
}

/** Index of the half a round (1-based) belongs to; overtime halves continue the count. */
export function halfIndex(round: number, rules: RoundRules): number {
  const regulation = rules.regulationMR * 2;
  if (round <= regulation) return round <= rules.regulationMR ? 0 : 1;
  return 2 + Math.floor((round - regulation - 1) / rules.overtimeMR);
}

/** Side a team played in `round`, given the side it plays in `currentRound` (sides swap every half). */
export function sideInRound(currentSide: 'CT' | 'T', currentRound: number, round: number, rules: RoundRules): 'CT' | 'T' {
  const swaps = Math.abs(halfIndex(round, rules) - halfIndex(currentRound, rules));
  return swaps % 2 === 0 ? currentSide : currentSide === 'CT' ? 'T' : 'CT';
}

/** "de_mirage" or "workshop/123/de_mirage" → "de_mirage" */
export function normalizeMapName(name: string): string {
  return name.substring(name.lastIndexOf('/') + 1);
}

/** "de_mirage" → "Mirage" */
export function prettyMapName(name: string): string {
  const base = normalizeMapName(name).replace(/^(de|cs|ar)_/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function countryFlagEmoji(code: string | null | undefined): string | null {
  if (!code || code.length !== 2) return null;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

/** All competitive maps the HUD knows (radar, banners); offered in veto and map selects. */
export const ACTIVE_DUTY_MAPS = [
  'de_ancient',
  'de_anubis',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_overpass',
  'de_train',
  'de_vertigo',
  'de_cache',
] as const;

/**
 * Current Active Duty pool (default for vetos). Since Premier Season 5 (July 2026)
 * Cache replaces Overpass: Ancient, Anubis, Cache, Dust2, Inferno, Mirage, Nuke.
 */
export const ACTIVE_MAP_POOL = ['de_ancient', 'de_anubis', 'de_cache', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke'] as const;
