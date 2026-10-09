import { useState } from 'react';
import { ACTIVE_DUTY_MAPS, prettyMapName, type Match, type MatchType, type TeamProfile, type Veto } from '@tacam/shared';
import { api, uploadUrl, useData, type MatchInput } from '../api';
import { Card, ConfirmButton, Field, Modal, PageHeader, Toggle, useRun } from '../components/ui';

const emptyVeto = (): Veto => ({
  type: 'pick',
  mapName: 'de_mirage',
  teamId: null,
  side: 'NO',
  reverseSide: false,
  score: {},
  winner: null,
  mapEnd: false,
});

const emptyMatch: MatchInput = {
  left: { id: null, wins: 0 },
  right: { id: null, wins: 0 },
  matchType: 'bo3',
  current: false,
  vetos: [],
  title: '',
  startTime: null,
};

/** Standard BO1/BO3/BO5 veto order so the producer only fills in maps and teams. */
function vetoTemplate(type: MatchType, left: string | null, right: string | null): Veto[] {
  const order: Record<MatchType, Veto['type'][]> = {
    bo1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'],
    bo2: ['ban', 'ban', 'pick', 'pick'],
    bo3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'],
    bo5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'],
  };
  return order[type].map((vetoType, i) => ({
    ...emptyVeto(),
    type: vetoType,
    mapName: ACTIVE_DUTY_MAPS[i],
    teamId: vetoType === 'decider' ? null : i % 2 === 0 ? left : right,
  }));
}

function VetoRow({ veto, teams, matchTeams, onChange, onRemove }: { veto: Veto; teams: TeamProfile[]; matchTeams: (string | null)[]; onChange: (v: Veto) => void; onRemove: () => void }) {
  const set = (patch: Partial<Veto>) => onChange({ ...veto, ...patch });
  const options = teams.filter((t) => matchTeams.includes(t.id));
  return (
    <div className="veto_row">
      <select value={veto.type} onChange={(e) => set({ type: e.target.value as Veto['type'] })}>
        <option value="ban">Ban</option>
        <option value="pick">Pick</option>
        <option value="decider">Decider</option>
      </select>
      <select value={veto.mapName} onChange={(e) => set({ mapName: e.target.value })}>
        {ACTIVE_DUTY_MAPS.map((m) => (
          <option key={m} value={m}>
            {prettyMapName(m)}
          </option>
        ))}
      </select>
      <select value={veto.teamId ?? ''} disabled={veto.type === 'decider'} onChange={(e) => set({ teamId: e.target.value || null })}>
        <option value="">—</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.shortName || t.name}
          </option>
        ))}
      </select>
      <select value={veto.side} disabled={veto.type === 'ban'} onChange={(e) => set({ side: e.target.value as Veto['side'] })}>
        <option value="NO">Seite: —</option>
        <option value="CT">Start CT</option>
        <option value="T">Start T</option>
      </select>
      <Toggle checked={veto.reverseSide} onChange={(reverseSide) => set({ reverseSide })} label="Seiten tauschen" />
      {veto.type !== 'ban' && (
        <>
          {matchTeams.map((id) => {
            const team = teams.find((t) => t.id === id);
            if (!id || !team) return null;
            return (
              <input
                key={id}
                className="score_input"
                type="number"
                min={0}
                title={`Runden ${team.name}`}
                placeholder={team.shortName || team.name}
                value={veto.score[id] ?? ''}
                onChange={(e) => set({ score: { ...veto.score, [id]: Number(e.target.value) } })}
              />
            );
          })}
          <select value={veto.winner ?? ''} onChange={(e) => set({ winner: e.target.value || null, mapEnd: !!e.target.value })}>
            <option value="">Sieger: —</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.shortName || t.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button className="icon_button" onClick={onRemove} aria-label="Veto entfernen">
        ×
      </button>
    </div>
  );
}

function MatchForm({ initial, teams, onClose }: { initial: Match | null; teams: TeamProfile[]; onClose: () => void }) {
  const run = useRun();
  const [match, setMatch] = useState<MatchInput>(initial ?? emptyMatch);
  const set = (patch: Partial<MatchInput>) => setMatch((m) => ({ ...m, ...patch }));
  const save = async () => {
    const ok = await run(() => (initial ? api.matches.update(initial.id, match) : api.matches.create(match)), 'Match gespeichert');
    if (ok) onClose();
  };
  const teamSelect = (side: 'left' | 'right') => (
    <div className="grid two">
      <Field label={side === 'left' ? 'Team links' : 'Team rechts'}>
        <select value={match[side].id ?? ''} onChange={(e) => set({ [side]: { ...match[side], id: e.target.value || null } })}>
          <option value="">—</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gewonnene Maps">
        <input type="number" min={0} max={3} value={match[side].wins} onChange={(e) => set({ [side]: { ...match[side], wins: Number(e.target.value) } })} />
      </Field>
    </div>
  );

  return (
    <Modal
      title={initial ? 'Match bearbeiten' : 'Neues Match'}
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
      <div className="grid two">
        <Field label="Titel" hint="z. B. Upper Bracket Final">
          <input value={match.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Format">
          <select value={match.matchType} onChange={(e) => set({ matchType: e.target.value as MatchType })}>
            <option value="bo1">Best of 1</option>
            <option value="bo2">Best of 2</option>
            <option value="bo3">Best of 3</option>
            <option value="bo5">Best of 5</option>
          </select>
        </Field>
      </div>
      {teamSelect('left')}
      {teamSelect('right')}
      <Toggle checked={match.current} onChange={(current) => set({ current })} label="Aktuelles Match (wird im HUD verwendet)" />

      <div className="section_title">
        <h3>Map-Veto</h3>
        <div className="row">
          <button className="button small ghost" onClick={() => set({ vetos: vetoTemplate(match.matchType, match.left.id, match.right.id) })}>
            Vorlage für {match.matchType.toUpperCase()}
          </button>
          <button className="button small" onClick={() => set({ vetos: [...match.vetos, emptyVeto()] })}>
            + Eintrag
          </button>
        </div>
      </div>
      <div className="stack">
        {match.vetos.map((veto, i) => (
          <VetoRow
            key={i}
            veto={veto}
            teams={teams}
            matchTeams={[match.left.id, match.right.id]}
            onChange={(v) => set({ vetos: match.vetos.map((x, j) => (j === i ? v : x)) })}
            onRemove={() => set({ vetos: match.vetos.filter((_, j) => j !== i) })}
          />
        ))}
        {!match.vetos.length && <p className="muted">Noch kein Veto. Ergebnisse werden am Map-Ende automatisch eingetragen.</p>}
      </div>
    </Modal>
  );
}

export function MatchesPage() {
  const run = useRun();
  const { data: matches } = useData(api.matches.list, []);
  const { data: teams } = useData(api.teams.list, []);
  const [editing, setEditing] = useState<Match | 'new' | null>(null);
  const team = (id: string | null) => teams.find((t) => t.id === id);

  return (
    <>
      <PageHeader
        title="Matches"
        description="Das aktuelle Match liefert Teams, Serienstand und Veto für HUD und Szenen."
        actions={
          <button className="button primary" onClick={() => setEditing('new')}>
            + Match
          </button>
        }
      />
      <div className="stack">
        {matches.map((m) => {
          const left = team(m.left.id);
          const right = team(m.right.id);
          return (
            <Card key={m.id} className={`match_card ${m.current ? 'current' : ''}`}>
              <div className="match_card_body">
                <div className="match_team">
                  {left?.logo && <img src={uploadUrl(left.logo)!} alt="" />}
                  <b>{left?.name ?? 'TBD'}</b>
                </div>
                <div className="match_score">
                  {m.left.wins} : {m.right.wins}
                  <div className="muted small">
                    {m.matchType.toUpperCase()} {m.title && `· ${m.title}`}
                  </div>
                </div>
                <div className="match_team right">
                  <b>{right?.name ?? 'TBD'}</b>
                  {right?.logo && <img src={uploadUrl(right.logo)!} alt="" />}
                </div>
              </div>
              <div className="veto_chips">
                {m.vetos.map((v, i) => (
                  <span key={i} className={`chip ${v.type}`}>
                    {v.type === 'ban' ? '✕' : v.type === 'pick' ? '✓' : '◆'} {prettyMapName(v.mapName)}
                    {v.mapEnd && ` ${Object.values(v.score).join(':')}`}
                  </span>
                ))}
              </div>
              <div className="row">
                <button className={`button small ${m.current ? 'primary' : ''}`} onClick={() => run(() => api.matches.toggleCurrent(m.id))}>
                  {m.current ? '● Aktuell' : 'Als aktuell setzen'}
                </button>
                <button className="button small" onClick={() => setEditing(m)}>
                  Bearbeiten
                </button>
                <ConfirmButton className="small danger" onConfirm={() => run(() => api.matches.remove(m.id), 'Match gelöscht')}>
                  Löschen
                </ConfirmButton>
              </div>
            </Card>
          );
        })}
        {!matches.length && (
          <Card>
            <p className="muted">Noch keine Matches.</p>
          </Card>
        )}
      </div>
      {editing && <MatchForm initial={editing === 'new' ? null : editing} teams={teams} onClose={() => setEditing(null)} />}
    </>
  );
}
