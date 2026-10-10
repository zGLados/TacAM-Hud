import { useMemo, useRef, useState } from 'react';
import { countryFlagEmoji, type PlayerProfile, type TeamProfile } from '@tacam/shared';
import { api, uploadUrl, useData, type PlayerInput } from '../api';
import { Card, ConfirmButton, CountrySelect, Field, ImageUpload, Modal, PageHeader, Toggle, useRun, useToast } from '../components/ui';

const emptyPlayer: PlayerInput = {
  steamid: '',
  username: '',
  firstName: '',
  lastName: '',
  country: null,
  avatar: null,
  teamId: null,
  isCoach: false,
  extra: {},
};

function PlayerForm({ initial, teams, onClose }: { initial: PlayerProfile | null; teams: TeamProfile[]; onClose: () => void }) {
  const run = useRun();
  const [player, setPlayer] = useState<PlayerInput>(initial ?? emptyPlayer);
  const set = (patch: Partial<PlayerInput>) => setPlayer((p) => ({ ...p, ...patch }));
  const save = async () => {
    const ok = await run(
      () => (initial ? api.players.update(initial.id, player) : api.players.create(player)),
      initial ? 'Player saved' : 'Player created'
    );
    if (ok) onClose();
  };
  return (
    <Modal
      title={initial ? `Edit ${initial.username}` : 'New player'}
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="form_with_image">
        <ImageUpload value={player.avatar} onChange={(avatar) => set({ avatar })} label="Choose avatar" />
        <div className="stack grow">
          <Field label="Name in the HUD">
            <input value={player.username} onChange={(e) => set({ username: e.target.value })} autoFocus />
          </Field>
          <Field label="SteamID64" hint="17 digits, e.g. 76561198012345678">
            <input value={player.steamid} onChange={(e) => set({ steamid: e.target.value.trim() })} />
          </Field>
        </div>
      </div>
      <div className="grid two">
        <Field label="First name">
          <input value={player.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <input value={player.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </Field>
        <Field label="Country">
          <CountrySelect value={player.country} onChange={(country) => set({ country })} />
        </Field>
        <Field label="Team">
          <select value={player.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || null })}>
            <option value="">— no team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Toggle checked={player.isCoach} onChange={(isCoach) => set({ isCoach })} label="Coach (hidden in the HUD)" />
    </Modal>
  );
}

/** Parses "steamid;username;firstName;lastName;country;team" (comma or semicolon separated, header optional). */
function parseCsv(text: string, teams: TeamProfile[]): PlayerInput[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const separator = lines[0]?.includes(';') ? ';' : ',';
  return lines
    .map((line) => line.split(separator).map((c) => c.trim().replace(/^"|"$/g, '')))
    .filter((cols) => /^\d{17}$/.test(cols[0]))
    .map(([steamid, username, firstName = '', lastName = '', country = '', team = '']) => ({
      ...emptyPlayer,
      steamid,
      username: username || steamid,
      firstName,
      lastName,
      country: country ? country.toUpperCase() : null,
      teamId: teams.find((t) => t.name.toLowerCase() === team.toLowerCase() || t.shortName.toLowerCase() === team.toLowerCase())?.id ?? null,
    }));
}

/** Team names in the last column of a player CSV. */
function csvTeamNames(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const separator = lines[0]?.includes(';') ? ';' : ',';
  return lines
    .map((line) => line.split(separator).map((c) => c.trim().replace(/^"|"$/g, '')))
    .filter((cols) => /^\d{17}$/.test(cols[0]) && cols[5])
    .map((cols) => cols[5]);
}

export function PlayersPage() {
  const run = useRun();
  const toast = useToast();
  const { data: players } = useData(api.players.list, []);
  const { data: teams } = useData(api.teams.list, []);
  const [editing, setEditing] = useState<PlayerProfile | 'new' | null>(null);
  const [filter, setFilter] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const q = filter.toLowerCase();
    return players
      .filter((p) => !q || [p.username, p.steamid, p.firstName, p.lastName].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [players, filter]);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        title="Players"
        description="The SteamID links profile, avatar and team to the live data from CS2."
        actions={
          <>
            <button className="button ghost" onClick={() => fileInput.current?.click()}>
              Import CSV
            </button>
            <button className="button primary" onClick={() => setEditing('new')}>
              + Player
            </button>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const text = await file.text();
          // Teams named in the CSV but not in the database are created first, so one file is enough.
          const known = new Set(teams.flatMap((t) => [t.name.toLowerCase(), t.shortName.toLowerCase()]));
          const missing = [...new Set(csvTeamNames(text).filter((n) => !known.has(n.toLowerCase())))];
          if (missing.length) await api.teams.import(missing.map((name) => ({ name, shortName: '', country: null })));
          const rows = parseCsv(text, missing.length ? await api.teams.list() : teams);
          if (!rows.length) return toast('No valid rows (the first column must be a SteamID64)', 'error');
          const result = await run(() => api.players.import(rows));
          if (result) toast(`${result.created} created, ${result.updated} updated${missing.length ? `, ${missing.length} new teams` : ''}`);
        }}
      />
      <Card>
        <input className="search" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th>Real name</th>
              <th>SteamID</th>
              <th>Team</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td className="avatar_cell">{p.avatar ? <img src={uploadUrl(p.avatar)!} alt="" /> : <span className="avatar_placeholder" />}</td>
                <td>
                  {countryFlagEmoji(p.country)} {p.username} {p.isCoach && <span className="badge">Coach</span>}
                </td>
                <td>{`${p.firstName} ${p.lastName}`.trim() || '—'}</td>
                <td className="mono">{p.steamid}</td>
                <td>{teamName(p.teamId)}</td>
                <td className="right nowrap">
                  <button className="button small" onClick={() => setEditing(p)}>
                    Edit
                  </button>{' '}
                  <ConfirmButton className="small danger" onConfirm={() => run(() => api.players.remove(p.id), 'Player deleted')}>
                    Delete
                  </ConfirmButton>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={6} className="muted center">
                  No players yet. Tip: the Live tab creates players straight from the running game.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted small">CSV format: steamid;name;first name;last name;country;team (team by name or short name; missing teams are created)</p>
      </Card>
      {editing && <PlayerForm initial={editing === 'new' ? null : editing} teams={teams} onClose={() => setEditing(null)} />}
    </>
  );
}
