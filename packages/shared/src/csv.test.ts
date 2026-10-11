import { describe, expect, it } from 'vitest';
import { csvRows, playersToCsv, teamsToCsv } from './csv.js';
import type { PlayerProfile, TeamProfile } from './types.js';

const team = (id: string, name: string, shortName: string, country: string | null): TeamProfile =>
  ({ id, name, shortName, country, logo: null }) as unknown as TeamProfile;
const player = (steamid: string, username: string, teamId: string | null, extra: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: steamid,
  steamid,
  username,
  firstName: '',
  lastName: '',
  country: null,
  avatar: null,
  teamId,
  isCoach: false,
  extra: {},
  ...extra,
});

describe('CSV export / import', () => {
  it('exports players in the import format, with team names', () => {
    const teams = [team('t1', 'TacAM Red', 'TCR', 'DE')];
    const csv = playersToCsv([player('76561198000000001', 'zGLados', 't1', { firstName: 'Jörg', lastName: 'Müller', country: 'DE' }), player('76561198000000002', 'solo', null)], teams);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csvRows(csv)).toEqual([
      ['steamid', 'name', 'first name', 'last name', 'country', 'team'],
      ['76561198000000001', 'zGLados', 'Jörg', 'Müller', 'DE', 'TacAM Red'],
      ['76561198000000002', 'solo', '', '', '', ''],
    ]);
  });

  it('round-trips teams and keeps separators out of the values', () => {
    const rows = csvRows(teamsToCsv([team('a', 'Blue; Phoenix', 'BLU', null)]));
    // the header is the first row (the import skips it), the BOM is gone
    expect(rows[0][0]).toBe('name');
    expect(rows[1]).toEqual(['Blue Phoenix', 'BLU', '']);
  });

  it('reads comma files and files saved by Excel', () => {
    expect(csvRows('﻿name,short name,country\r\n"TacAM Red",TCR,de\r\n')).toEqual([
      ['name', 'short name', 'country'],
      ['TacAM Red', 'TCR', 'de'],
    ]);
  });
});
