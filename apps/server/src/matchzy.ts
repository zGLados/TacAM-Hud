import { ACTIVE_MAP_POOL, type Match } from '@tacam/shared';
import type { Store } from './store.js';

const MAPS_PER_FORMAT = { bo1: 1, bo2: 2, bo3: 3, bo5: 5 } as const;

/** Stable numeric match id for MatchZy (it expects a number) derived from the TacAM id. */
function numericId(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 1_000_000_000;
}

/**
 * MatchZy match config (CS2 server plugin, Get5-like format) for a match:
 * teams with their players' SteamID64s and, once the veto is done, the maps
 * in order with sides; without a veto the map pool is vetoed in game.
 */
export function matchzyConfig(store: Store, match: Match) {
  const team = (slot: 'left' | 'right') => {
    const profile = match[slot].id ? store.get('teams', match[slot].id!) : undefined;
    const players = store.list('players').filter((p) => p.teamId && p.teamId === match[slot].id && !p.isCoach);
    return { profile, players: Object.fromEntries(players.map((p) => [p.steamid, p.username])) };
  };
  const team1 = team('left');
  const team2 = team('right');
  const numMaps = MAPS_PER_FORMAT[match.matchType];
  const played = match.vetos.filter((v) => v.type !== 'ban');
  const vetoDone = played.length >= numMaps;

  // Veto.side is the picking team's starting side; MatchZy names the team that starts CT.
  const side = (v: Match['vetos'][number]) => {
    if (v.type === 'decider' || v.side === 'NO' || !v.teamId) return 'knife';
    const pickerIsTeam1 = v.teamId === match.left.id;
    return (v.side === 'CT') === pickerIsTeam1 ? 'team1_ct' : 'team2_ct';
  };
  const pool = match.captainVeto?.pool ?? ACTIVE_MAP_POOL;
  const rosterSize = Math.max(Object.keys(team1.players).length, Object.keys(team2.players).length);

  return {
    matchid: numericId(match.id),
    team1: { name: team1.profile?.name ?? 'Team 1', players: team1.players },
    team2: { name: team2.profile?.name ?? 'Team 2', players: team2.players },
    num_maps: numMaps,
    maplist: vetoDone ? played.slice(0, numMaps).map((v) => v.mapName) : [...pool],
    ...(vetoDone ? { map_sides: played.slice(0, numMaps).map(side), skip_veto: true } : { skip_veto: false }),
    clinch_series: true,
    players_per_team: rosterSize > 0 && rosterSize < 5 ? rosterSize : 5,
    cvars: { hostname: `${team1.profile?.name ?? 'Team 1'} vs ${team2.profile?.name ?? 'Team 2'}`.replace(/["';\r\n]/g, '') },
  };
}
