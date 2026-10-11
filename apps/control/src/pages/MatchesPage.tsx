import { useState } from 'react';
import { ACTIVE_DUTY_MAPS, ACTIVE_MAP_POOL, VETO_ORDER, captainSteps, prettyMapName, vetoMapsNeeded, type Match, type MatchType, type TeamProfile, type Veto } from '@tacam/shared';
import { api, uploadUrl, useData, type MatchInput, type Settings } from '../api';
import { Card, ConfirmButton, CopyField, Field, Group, Modal, PageHeader, Toggle, useRun } from '../components/ui';
import { TransferButtons } from '../components/Transfer';

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
  roundsPerHalf: null,
};

/** Standard veto order so the producer only fills in maps and teams. */
function vetoTemplate(type: MatchType, left: string | null, right: string | null): Veto[] {
  return VETO_ORDER[type].map((vetoType, i) => ({
    ...emptyVeto(),
    type: vetoType,
    mapName: ACTIVE_MAP_POOL[i],
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
        <option value="NO">Side: —</option>
        <option value="CT">Start CT</option>
        <option value="T">Start T</option>
      </select>
      <Toggle checked={veto.reverseSide} onChange={(reverseSide) => set({ reverseSide })} label="Swap sides" />
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
                title={`Rounds ${team.name}`}
                placeholder={team.shortName || team.name}
                value={veto.score[id] ?? ''}
                onChange={(e) => set({ score: { ...veto.score, [id]: Number(e.target.value) } })}
              />
            );
          })}
          <select value={veto.winner ?? ''} onChange={(e) => set({ winner: e.target.value || null, mapEnd: !!e.target.value })}>
            <option value="">Winner: —</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.shortName || t.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button className="icon_button" onClick={onRemove} aria-label="Remove veto">
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
    const ok = await run(() => (initial ? api.matches.update(initial.id, match) : api.matches.create(match)), 'Match saved');
    if (ok) onClose();
  };
  const teamSelect = (side: 'left' | 'right') => (
    <div className="grid two">
      <Field label={side === 'left' ? 'Left team' : 'Right team'}>
        <select value={match[side].id ?? ''} onChange={(e) => set({ [side]: { ...match[side], id: e.target.value || null } })}>
          <option value="">—</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Maps won">
        <input type="number" min={0} max={3} value={match[side].wins} onChange={(e) => set({ [side]: { ...match[side], wins: Number(e.target.value) } })} />
      </Field>
    </div>
  );

  return (
    <Modal
      title={initial ? 'Edit match' : 'New match'}
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
      <div className="grid two">
        <Field label="Title" hint="e.g. Upper Bracket Final">
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
      <Field label="Rounds per half" hint="Leave empty: 12, or 8 for wingman (detected from the game mode). Set it for custom servers, e.g. 1v1 with MR6.">
        <input
          type="number"
          min={1}
          max={30}
          placeholder="automatic"
          value={match.roundsPerHalf ?? ''}
          onChange={(e) => set({ roundsPerHalf: e.target.value ? Number(e.target.value) : null })}
        />
      </Field>
      {teamSelect('left')}
      {teamSelect('right')}
      <Toggle checked={match.current} onChange={(current) => set({ current })} label="Current match (used by the HUD)" />

      <div className="section_title">
        <h3>Map veto</h3>
        <div className="row">
          <button className="button small ghost" onClick={() => set({ vetos: vetoTemplate(match.matchType, match.left.id, match.right.id) })}>
            Template for {match.matchType.toUpperCase()}
          </button>
          <button className="button small" onClick={() => set({ vetos: [...match.vetos, emptyVeto()] })}>
            + Entry
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
        {!match.vetos.length && <p className="muted">No veto yet. Results are filled in automatically at the end of each map.</p>}
      </div>
    </Modal>
  );
}

/** Starts a captain veto and shows the links for the captains (apps/server/src/captainVeto.ts). */
function CaptainVetoDialog({ match, teams, onClose }: { match: Match; teams: TeamProfile[]; onClose: () => void }) {
  const run = useRun();
  const { data: settings } = useData<Settings | null>(api.settings.get, null);
  const [first, setFirst] = useState<'left' | 'right'>('left');
  const [sideChoice, setSideChoice] = useState(true);
  const needed = vetoMapsNeeded(match.matchType);
  const [pool, setPool] = useState<string[]>(ACTIVE_MAP_POOL.slice(0, needed));
  const [host, setHost] = useState('');
  const name = (slot: 'left' | 'right') => teams.find((t) => t.id === match[slot].id)?.name ?? (slot === 'left' ? 'Left team' : 'Right team');
  const session = match.captainVeto;
  const port = window.location.port || '1349';
  // Captains on their own devices need the LAN address (and LAN access), not 127.0.0.1.
  const hosts = settings ? [...(settings.lanAccess ? settings.addresses : []), '127.0.0.1'] : [];
  const base = `http://${host || hosts[0] || '127.0.0.1'}:${port}/control/veto.html?t=`;
  const steps = session ? captainSteps(match.matchType, session.first, session.sideChoice, match.vetos) : [];
  const hasDecider = VETO_ORDER[match.matchType].includes('decider');
  const poolOk = hasDecider ? pool.length === needed : pool.length >= needed;

  const start = () => run(() => api.matches.startCaptainVeto(match.id, { first, sideChoice, pool }), 'Veto started');
  return (
    <Modal
      title={`Captain veto · ${name('left')} vs ${name('right')}`}
      onClose={onClose}
      footer={
        session ? (
          <>
            <ConfirmButton className="ghost" onConfirm={() => run(() => api.matches.stopCaptainVeto(match.id), 'Veto ended')}>
              End veto
            </ConfirmButton>
            <button className="button primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <button className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={!poolOk || !match.left.id || !match.right.id} onClick={start}>
              Start veto
            </button>
          </>
        )
      }
    >
      {session ? (
        <>
          <p className="muted">
            Step {Math.min(session.step, steps.length)} / {steps.length}
            {session.step >= steps.length && ' · finished'}. Every step appears in the veto scene right away. Send each captain only their
            own link.
          </p>
          {hosts.length > 1 && (
            <Field label="Address used in the links">
              <select value={host || hosts[0]} onChange={(e) => setHost(e.target.value)}>
                {hosts.map((h) => (
                  <option key={h} value={h}>
                    {h === '127.0.0.1' ? '127.0.0.1 (this computer only)' : h}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {settings && !settings.lanAccess && (
            <p className="muted small">LAN access is off: the links only work on this computer. Enable it in the settings for captains on their own devices.</p>
          )}
          <CopyField label={`${name('left')} (captain)`} value={base + session.tokens.left} />
          <CopyField label={`${name('right')} (captain)`} value={base + session.tokens.right} />
          <CopyField label="Both teams on one device (stage / LAN)" value={base + session.tokens.both} />
          <ConfirmButton className="small ghost" onConfirm={start}>
            Restart veto (new links, clears the veto)
          </ConfirmButton>
        </>
      ) : (
        <>
          {!match.left.id || !match.right.id ? <p className="muted">Set both teams of the match first.</p> : null}
          <Field label="Starts">
            <select value={first} onChange={(e) => setFirst(e.target.value as 'left' | 'right')}>
              <option value="left">{name('left')}</option>
              <option value="right">{name('right')}</option>
            </select>
          </Field>
          <Toggle checked={sideChoice} onChange={setSideChoice} label="After each pick the other team chooses its starting side" />
          <Group label={`Map pool (${pool.length} selected, ${hasDecider ? 'exactly' : 'at least'} ${needed} needed)`}>
            <div className="toggle_grid">
              {ACTIVE_DUTY_MAPS.map((m) => (
                <Toggle
                  key={m}
                  checked={pool.includes(m)}
                  onChange={(on) => setPool(on ? ACTIVE_DUTY_MAPS.filter((x) => x === m || pool.includes(x)) : pool.filter((x) => x !== m))}
                  label={prettyMapName(m)}
                />
              ))}
            </div>
          </Group>
          <p className="muted small">Starting replaces the current veto of this match.</p>
        </>
      )}
    </Modal>
  );
}

export function MatchesPage() {
  const run = useRun();
  const { data: matches } = useData(api.matches.list, []);
  const { data: teams } = useData(api.teams.list, []);
  const [editing, setEditing] = useState<Match | 'new' | null>(null);
  const [vetoFor, setVetoFor] = useState<string | null>(null);
  const team = (id: string | null) => teams.find((t) => t.id === id);

  return (
    <>
      <PageHeader
        title="Matches"
        description="The current match provides teams, series score and veto for the HUD and scenes."
        actions={
          <>
            <TransferButtons sections={['matches']} />
            <button className="button primary" onClick={() => setEditing('new')}>
              + Match
            </button>
          </>
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
                  {m.current ? '● Current' : 'Set as current'}
                </button>
                <button className={`button small ${m.captainVeto ? 'primary' : ''}`} onClick={() => setVetoFor(m.id)}>
                  {m.captainVeto ? 'Captain veto running' : 'Captain veto'}
                </button>
                <a
                  className="button small ghost"
                  href={`/api/matches/${m.id}/matchzy.json`}
                  download
                  title="Match config for the MatchZy CS2 server plugin (load with matchzy_loadmatch)"
                >
                  MatchZy config
                </a>
                <button className="button small" onClick={() => setEditing(m)}>
                  Edit
                </button>
                <ConfirmButton className="small danger" onConfirm={() => run(() => api.matches.remove(m.id), 'Match deleted')}>
                  Delete
                </ConfirmButton>
              </div>
            </Card>
          );
        })}
        {!matches.length && (
          <Card>
            <p className="muted">No matches yet.</p>
          </Card>
        )}
      </div>
      {vetoFor && matches.some((m) => m.id === vetoFor) && (
        <CaptainVetoDialog match={matches.find((m) => m.id === vetoFor)!} teams={teams} onClose={() => setVetoFor(null)} />
      )}
      {editing && <MatchForm initial={editing === 'new' ? null : editing} teams={teams} onClose={() => setEditing(null)} />}
    </>
  );
}
