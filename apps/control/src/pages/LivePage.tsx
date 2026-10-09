import { useState } from 'react';
import { prettyMapName, type LivePlayerSummary } from '@tacam/shared';
import { api, useData, useLive } from '../api';
import { Card, Field, Modal, PageHeader, useRun } from '../components/ui';

function AddPlayerModal({ player, onClose }: { player: LivePlayerSummary; onClose: () => void }) {
  const run = useRun();
  const { data: teams } = useData(api.teams.list, []);
  const [username, setUsername] = useState(player.name);
  const [teamId, setTeamId] = useState<string>('');
  const save = async () => {
    const created = await run(
      () =>
        api.players.create({
          steamid: player.steamid,
          username,
          firstName: '',
          lastName: '',
          country: null,
          avatar: null,
          teamId: teamId || null,
          isCoach: false,
          extra: {},
        }),
      `${username} angelegt`
    );
    if (created) onClose();
  };
  return (
    <Modal
      title="Spieler anlegen"
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="button primary" onClick={save}>
            Anlegen
          </button>
        </>
      }
    >
      <Field label="SteamID64">
        <input value={player.steamid} disabled />
      </Field>
      <Field label="Name">
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="Team">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— kein Team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

function TeamTable({ side, players, onAdd }: { side: 'left' | 'right'; players: LivePlayerSummary[]; onAdd: (p: LivePlayerSummary) => void }) {
  const summary = useLive((s) => s.summary)!;
  const team = summary[side];
  return (
    <Card title={<span className={`side_${team.side}`}>{team.name} · {team.score}</span>}>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Spieler</th>
            <th>K</th>
            <th>A</th>
            <th>D</th>
            <th>HP</th>
            <th>$</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {players
            .filter((p) => p.side === team.side)
            .sort((a, b) => (a.observerSlot ?? 10) - (b.observerSlot ?? 10))
            .map((p) => (
              <tr key={p.steamid} className={summary.observed === p.steamid ? 'highlight' : ''}>
                <td>{p.observerSlot}</td>
                <td>
                  {p.name}
                  <div className="muted small">{p.steamid}</div>
                </td>
                <td>{p.kills}</td>
                <td>{p.assists}</td>
                <td>{p.deaths}</td>
                <td>{p.health}</td>
                <td>${p.money}</td>
                <td className="right">
                  {p.profileId ? (
                    <span className="badge ok">bekannt</span>
                  ) : (
                    <button className="button small" onClick={() => onAdd(p)}>
                      + Anlegen
                    </button>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}

export function LivePage() {
  const run = useRun();
  const status = useLive((s) => s.status);
  const summary = useLive((s) => s.summary);
  const { data: demo, setData: setDemo } = useData(api.demo.status, { running: false });
  const [adding, setAdding] = useState<LivePlayerSummary | null>(null);

  return (
    <>
      <PageHeader
        title="Live"
        description="Aktueller Spielstand aus CS2. Unbekannte Spieler lassen sich direkt mit SteamID anlegen."
        actions={
          <>
            <button className="button ghost" onClick={() => run(api.demo.seed, 'Demo-Teams, -Spieler und -Match angelegt')}>
              Demo-Daten anlegen
            </button>
            {demo.running ? (
              <button className="button" onClick={async () => setDemo((await run(api.demo.stop)) ?? demo)}>
                Demo stoppen
              </button>
            ) : (
              <button className="button primary" onClick={async () => setDemo((await run(api.demo.start)) ?? demo)}>
                Demo-Match starten
              </button>
            )}
          </>
        }
      />
      <div className="status_row">
        <div className={`status_pill ${status?.connected ? 'ok' : 'off'}`}>
          {status?.connected ? 'GSI verbunden' : 'Keine GSI-Daten'}
        </div>
        {summary && (
          <>
            <div className="status_pill">{prettyMapName(summary.map)}</div>
            <div className="status_pill">Runde {summary.round + 1}</div>
            <div className="status_pill">{summary.roundPhase ?? summary.mapPhase}</div>
          </>
        )}
        {demo.running && <div className="status_pill warn">Demo läuft</div>}
      </div>
      {!summary ? (
        <Card>
          <p className="muted">
            Noch keine Daten. Starte CS2 als Zuschauer (GSI-Config unter <b>Einstellungen</b> installieren) oder starte das
            Demo-Match.
          </p>
        </Card>
      ) : (
        <div className="grid two">
          <TeamTable side="left" players={summary.players} onAdd={setAdding} />
          <TeamTable side="right" players={summary.players} onAdd={setAdding} />
        </div>
      )}
      {adding && <AddPlayerModal player={adding} onClose={() => setAdding(null)} />}
    </>
  );
}
