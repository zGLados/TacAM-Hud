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
      initial ? 'Spieler gespeichert' : 'Spieler angelegt'
    );
    if (ok) onClose();
  };
  return (
    <Modal
      title={initial ? `${initial.username} bearbeiten` : 'Neuer Spieler'}
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="button primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form_with_image">
        <ImageUpload value={player.avatar} onChange={(avatar) => set({ avatar })} label="Avatar" />
        <div className="stack grow">
          <Field label="Name im HUD">
            <input value={player.username} onChange={(e) => set({ username: e.target.value })} autoFocus />
          </Field>
          <Field label="SteamID64" hint="17 Ziffern, z. B. 76561198012345678">
            <input value={player.steamid} onChange={(e) => set({ steamid: e.target.value.trim() })} />
          </Field>
        </div>
      </div>
      <div className="grid two">
        <Field label="Vorname">
          <input value={player.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        </Field>
        <Field label="Nachname">
          <input value={player.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </Field>
        <Field label="Land">
          <CountrySelect value={player.country} onChange={(country) => set({ country })} />
        </Field>
        <Field label="Team">
          <select value={player.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || null })}>
            <option value="">— kein Team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Toggle checked={player.isCoach} onChange={(isCoach) => set({ isCoach })} label="Coach (wird im HUD ausgeblendet)" />
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
        title="Spieler"
        description="Die SteamID verknüpft Profil, Avatar und Team mit den Live-Daten aus CS2."
        actions={
          <>
            <button className="button ghost" onClick={() => fileInput.current?.click()}>
              CSV importieren
            </button>
            <button className="button primary" onClick={() => setEditing('new')}>
              + Spieler
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
          const rows = parseCsv(await file.text(), teams);
          if (!rows.length) return toast('Keine gültigen Zeilen (erste Spalte muss eine SteamID64 sein)', 'error');
          const result = await run(() => api.players.import(rows));
          if (result) toast(`${result.created} angelegt, ${result.updated} aktualisiert`);
        }}
      />
      <Card>
        <input className="search" placeholder="Suchen…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th>Echter Name</th>
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
                    Bearbeiten
                  </button>{' '}
                  <ConfirmButton className="small danger" onConfirm={() => run(() => api.players.remove(p.id), 'Spieler gelöscht')}>
                    Löschen
                  </ConfirmButton>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={6} className="muted center">
                  Keine Spieler. Tipp: Im Live-Tab lassen sich Spieler direkt aus dem laufenden Spiel anlegen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted small">CSV-Format: steamid;name;vorname;nachname;land;team (Team per Name oder Kürzel)</p>
      </Card>
      {editing && <PlayerForm initial={editing === 'new' ? null : editing} teams={teams} onClose={() => setEditing(null)} />}
    </>
  );
}
