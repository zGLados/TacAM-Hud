import { useState } from 'react';
import { countryFlagEmoji, type TeamProfile } from '@tacam/shared';
import { api, uploadUrl, useData, type TeamInput } from '../api';
import { Card, ConfirmButton, CountrySelect, Field, ImageUpload, Modal, PageHeader, useRun } from '../components/ui';

const emptyTeam: TeamInput = { name: '', shortName: '', country: null, logo: null, extra: {} };

function TeamForm({ initial, onClose }: { initial: TeamProfile | null; onClose: () => void }) {
  const run = useRun();
  const [team, setTeam] = useState<TeamInput>(initial ?? emptyTeam);
  const set = (patch: Partial<TeamInput>) => setTeam((t) => ({ ...t, ...patch }));
  const save = async () => {
    const ok = await run(() => (initial ? api.teams.update(initial.id, team) : api.teams.create(team)), 'Team gespeichert');
    if (ok) onClose();
  };
  return (
    <Modal
      title={initial ? `${initial.name} bearbeiten` : 'Neues Team'}
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
        <ImageUpload value={team.logo} onChange={(logo) => set({ logo })} label="Logo" />
        <div className="stack grow">
          <Field label="Name">
            <input value={team.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
          <Field label="Kürzel" hint="Für Veto-Karten und schmale Anzeigen">
            <input value={team.shortName} maxLength={8} onChange={(e) => set({ shortName: e.target.value })} />
          </Field>
          <Field label="Land">
            <CountrySelect value={team.country} onChange={(country) => set({ country })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function TeamsPage() {
  const run = useRun();
  const { data: teams } = useData(api.teams.list, []);
  const { data: players } = useData(api.players.list, []);
  const [editing, setEditing] = useState<TeamProfile | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Teams"
        description="Logo und Name erscheinen in Matchbar, Szenen und Veto."
        actions={
          <button className="button primary" onClick={() => setEditing('new')}>
            + Team
          </button>
        }
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
                {roster.length ? roster.map((p) => <span key={p.id} className="chip">{p.username}</span>) : <span className="muted small">Keine Spieler</span>}
              </div>
              <div className="row">
                <button className="button small" onClick={() => setEditing(t)}>
                  Bearbeiten
                </button>
                <ConfirmButton className="small danger" onConfirm={() => run(() => api.teams.remove(t.id), 'Team gelöscht')}>
                  Löschen
                </ConfirmButton>
              </div>
            </Card>
          );
        })}
        {!teams.length && (
          <Card>
            <p className="muted">Noch keine Teams angelegt.</p>
          </Card>
        )}
      </div>
      {editing && <TeamForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
