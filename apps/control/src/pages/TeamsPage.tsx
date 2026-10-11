import { useRef, useState } from 'react';
import { countryFlagEmoji, type TeamProfile, csvRows, teamsToCsv } from '@tacam/shared';
import { datedFileName, downloadText } from '../download';
import { api, uploadUrl, useData, type TeamInput } from '../api';
import { Card, ConfirmButton, CountrySelect, Field, ImageUpload, Modal, PageHeader, useRun, useToast } from '../components/ui';

const emptyTeam: TeamInput = { name: '', shortName: '', country: null, logo: null, extra: {} };

function TeamForm({ initial, onClose }: { initial: TeamProfile | null; onClose: () => void }) {
  const run = useRun();
  const [team, setTeam] = useState<TeamInput>(initial ?? emptyTeam);
  const set = (patch: Partial<TeamInput>) => setTeam((t) => ({ ...t, ...patch }));
  const save = async () => {
    const ok = await run(() => (initial ? api.teams.update(initial.id, team) : api.teams.create(team)), 'Team saved');
    if (ok) onClose();
  };
  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : 'New team'}
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
        <ImageUpload value={team.logo} onChange={(logo) => set({ logo })} label="Choose logo" />
        <div className="stack grow">
          <Field label="Name">
            <input value={team.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
          <Field label="Short name" hint="For veto cards and narrow displays">
            <input value={team.shortName} maxLength={8} onChange={(e) => set({ shortName: e.target.value })} />
          </Field>
          <Field label="Country">
            <CountrySelect value={team.country} onChange={(country) => set({ country })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** Parses "name;shortName;country" (comma or semicolon separated, header optional). */
function parseTeamCsv(text: string) {
  return csvRows(text)
    .filter(([name], i) => name && !(i === 0 && name.toLowerCase() === 'name'))
    .map(([name, shortName = '', country = '']) => ({ name, shortName: shortName.slice(0, 8), country: country ? country.toUpperCase() : null }));
}

export function TeamsPage() {
  const run = useRun();
  const { data: teams } = useData(api.teams.list, []);
  const { data: players } = useData(api.players.list, []);
  const [editing, setEditing] = useState<TeamProfile | 'new' | null>(null);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <PageHeader
        title="Teams"
        description="Logo and name appear in the match bar, scenes and veto."
        actions={
          <>
            <button className="button ghost" onClick={() => fileInput.current?.click()}>
              Import CSV
            </button>
            <button
              className="button ghost"
              disabled={!teams.length}
              title="Same format as the import (logos are not part of the CSV)"
              onClick={() => downloadText(datedFileName('teams', 'csv'), teamsToCsv(teams))}
            >
              Export CSV
            </button>
            <button className="button primary" onClick={() => setEditing('new')}>
              + Team
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
          const rows = parseTeamCsv(await file.text());
          if (!rows.length) return toast('No teams found in the file', 'error');
          const result = await run(() => api.teams.import(rows));
          if (result) toast(`${result.created} created, ${result.updated} updated`);
        }}
      />
      <div className="team_grid">
        {teams.map((t) => {
          const roster = players.filter((p) => p.teamId === t.id);
          return (
            <Card key={t.id} className="team_card">
              <div className="team_card_head">
                {t.logo ? <img src={uploadUrl(t.logo)!} alt="" /> : <span className="logo_placeholder">{t.shortName || t.name[0]}</span>}
                <div>
                  <h3>
                    {countryFlagEmoji(t.country)} {t.name}
                  </h3>
                  <div className="muted">{t.shortName}</div>
                </div>
              </div>
              <div className="roster">
                {roster.length ? roster.map((p) => <span key={p.id} className="chip">{p.username}</span>) : <span className="muted small">No players</span>}
              </div>
              <div className="row">
                <button className="button small" onClick={() => setEditing(t)}>
                  Edit
                </button>
                <ConfirmButton className="small danger" onConfirm={() => run(() => api.teams.remove(t.id), 'Team deleted')}>
                  Delete
                </ConfirmButton>
              </div>
            </Card>
          );
        })}
        {!teams.length && (
          <Card>
            <p className="muted">No teams yet.</p>
          </Card>
        )}
      </div>
      <p className="muted small">CSV format: name;short name;country (e.g. "TacAM Red;TCR;DE"). Existing teams are matched by name; logos are added afterwards.</p>
      {editing && <TeamForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
