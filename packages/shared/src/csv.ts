import type { PlayerProfile, TeamProfile } from './types.js';

/**
 * CSV for players and teams (Players / Teams page): the export writes exactly what the
 * import reads, so export → edit in Excel → import round-trips. No quoting: values lose
 * separators and line breaks instead, which never occur in real names.
 */

export const PLAYER_CSV_HEADER = ['steamid', 'name', 'first name', 'last name', 'country', 'team'];
export const TEAM_CSV_HEADER = ['name', 'short name', 'country'];

/** Rows of a CSV file: `;` or `,` separated (from the first line), header kept, BOM and quotes removed. */
export function csvRows(text: string): string[][] {
  const lines = text
    .replace(/^﻿/, '') // Excel writes a BOM; it would stick to the first cell
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const separator = lines[0]?.includes(';') ? ';' : ',';
  return lines.map((line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, '')));
}

const clean = (value: string | null | undefined) => (value ?? '').replace(/\s*[;\r\n]+\s*/g, ' ').trim();

/** Semicolon CSV with a BOM, so Excel shows umlauts and splits the columns. */
export function toCsv(rows: (string | null | undefined)[][]) {
  return '﻿' + rows.map((row) => row.map(clean).join(';')).join('\r\n') + '\r\n';
}

export function playersToCsv(players: PlayerProfile[], teams: TeamProfile[]) {
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';
  return toCsv([PLAYER_CSV_HEADER, ...players.map((p) => [p.steamid, p.username, p.firstName, p.lastName, p.country, teamName(p.teamId)])]);
}

export function teamsToCsv(teams: TeamProfile[]) {
  return toCsv([TEAM_CSV_HEADER, ...teams.map((t) => [t.name, t.shortName, t.country])]);
}
