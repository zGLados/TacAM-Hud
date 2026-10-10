import { useCallback, useEffect, useState } from 'react';
import { prettyMapName, type CaptainStep, type MatchType, type Side, type VetoSlot } from '@tacam/shared';

/** State served by GET /api/captain/:token (apps/server/src/captainVeto.ts). */
interface VetoState {
  role: VetoSlot | 'both';
  matchType: MatchType;
  title: string;
  teams: Record<VetoSlot, { name: string; logo: string | null }>;
  pool: string[];
  remaining: string[];
  vetos: { type: 'ban' | 'pick' | 'decider'; mapName: string; team: VetoSlot | null; side: Side | 'NO' }[];
  step: CaptainStep | null;
  stepIndex: number;
  stepCount: number;
  done: boolean;
}

const token = new URLSearchParams(window.location.search).get('t') ?? '';
const endpoint = `/api/captain/${encodeURIComponent(token)}`;

async function call(init?: RequestInit): Promise<VetoState> {
  const res = await fetch(endpoint, { headers: { 'content-type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body;
}

const verb = { ban: 'ban', pick: 'pick', side: 'choose a side' } as const;

export function VetoApp() {
  const [state, setState] = useState<VetoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      call()
        .then((s) => {
          setState(s);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    []
  );
  useEffect(() => {
    load();
    // Polling keeps the page free of logins and sockets; one request per second is nothing.
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async (body: object) => {
    setBusy(true);
    try {
      setState(await call({ method: 'POST', body: JSON.stringify(body) }));
      setSelected(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <div className="veto_page">{error ? <p className="veto_error">{error}</p> : null}</div>;

  const { step, teams, role } = state;
  const myTurn = !!step && (role === 'both' || role === step.team);
  const actingName = step ? teams[step.team].name : '';
  const vetoOf = (map: string) => state.vetos.find((v) => v.mapName === map);

  let status: string;
  if (state.done) status = 'Veto finished';
  else if (!step) status = '';
  else if (myTurn) status = `${role === 'both' ? actingName : 'Your turn'}: ${verb[step.kind]}${step.kind === 'side' && step.mapName ? ` on ${prettyMapName(step.mapName)}` : ''}`;
  else status = `Waiting for ${actingName} to ${verb[step.kind]}`;

  return (
    <div className="veto_page">
      <header className="veto_header">
        <div className="veto_title">Map veto · {state.matchType.toUpperCase()}</div>
        {state.title && <div className="veto_subtitle">{state.title}</div>}
        <div className="veto_teams">
          {(['left', 'right'] as const).map((slot) => (
            <div key={slot} className={`veto_team ${step?.team === slot && !state.done ? 'is-active' : ''} ${role === slot ? 'is-me' : ''}`}>
              {teams[slot].logo && <img src={teams[slot].logo!} alt="" />}
              <span>{teams[slot].name}</span>
              {role === slot && <small>you</small>}
            </div>
          ))}
        </div>
      </header>

      <div className={`veto_status ${myTurn ? 'is-turn' : ''}`}>
        {status}
        {!state.done && (
          <small>
            Step {Math.min(state.stepIndex + 1, state.stepCount)} / {state.stepCount}
          </small>
        )}
      </div>
      {error && <p className="veto_error">{error}</p>}

      {myTurn && step?.kind === 'side' && (
        <div className="veto_sides">
          {(['CT', 'T'] as const).map((side) => (
            <button key={side} className={`veto_side_button side_${side}`} disabled={busy} onClick={() => send({ action: 'side', side })}>
              {role === 'both' ? `${actingName} starts` : 'Start'} {side}
            </button>
          ))}
        </div>
      )}

      <div className="veto_maps">
        {state.pool.map((map) => {
          const veto = vetoOf(map);
          const selectable = myTurn && (step?.kind === 'ban' || step?.kind === 'pick') && !veto;
          return (
            <button
              key={map}
              className={`veto_map ${veto ? `is-${veto.type}` : ''} ${selected === map ? 'is-selected' : ''}`}
              disabled={!selectable || busy}
              onClick={() => setSelected(map)}
            >
              <span className="veto_map_name">{prettyMapName(map)}</span>
              {veto && (
                <span className="veto_map_info">
                  {veto.type === 'decider' ? 'Decider' : `${veto.type === 'ban' ? 'Banned' : 'Picked'} by ${veto.team ? teams[veto.team].name : '?'}`}
                  {veto.type === 'pick' && veto.side !== 'NO' && veto.team && ` · starts ${veto.side}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {myTurn && selected && step && step.kind !== 'side' && (
        <div className="veto_confirm">
          <button className="button primary" disabled={busy} onClick={() => send({ action: step.kind, map: selected })}>
            {step.kind === 'ban' ? 'Ban' : 'Pick'} {prettyMapName(selected)}
          </button>
          <button className="button ghost" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
