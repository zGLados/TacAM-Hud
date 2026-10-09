import type { BuyType, PlayerMatchStats } from '@tacam/shared';
import { prettyMapName } from '@tacam/shared';
import { useLive } from '../api';
import { Card, PageHeader } from '../components/ui';

const BUY: Record<BuyType, string> = { pistol: 'Pistol', eco: 'Eco', semi: 'Semi', force: 'Force', full: 'Full' };

const COLUMNS: { key: keyof PlayerMatchStats; label: string; suffix?: string; digits?: number }[] = [
  { key: 'kills', label: 'K' },
  { key: 'assists', label: 'A' },
  { key: 'deaths', label: 'D' },
  { key: 'adr', label: 'ADR' },
  { key: 'kast', label: 'KAST', suffix: '%' },
  { key: 'hsPercent', label: 'HS', suffix: '%' },
  { key: 'kpr', label: 'KPR', digits: 2 },
  { key: 'openingKills', label: 'FK' },
  { key: 'openingDeaths', label: 'FD' },
  { key: 'clutchesWon', label: 'Clutch' },
  { key: 'rating', label: 'Rating', digits: 2 },
];

export function StatsPage() {
  const stats = useLive((s) => s.stats);
  const summary = useLive((s) => s.summary);
  if (!stats) return null;
  const bySide = (side: 'CT' | 'T') => stats.players.filter((p) => p.side === side);
  const teamName = (side: 'CT' | 'T') => (summary ? (summary.left.side === side ? summary.left.name : summary.right.name) : side);

  return (
    <>
      <PageHeader
        title="Statistik"
        description={`Live berechnet aus den GSI-Daten${stats.map ? ` · ${prettyMapName(stats.map)}` : ''}. Rating nach HLTV 1.0, KAST inkl. Trades (5 s).`}
      />
      {(['CT', 'T'] as const).map((side) => (
        <Card key={side} title={<span className={`side_${side}`}>{teamName(side)}</span>}>
          <table className="table">
            <thead>
              <tr>
                <th>Spieler</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="right">
                    {c.label}
                  </th>
                ))}
                <th className="right">Multi (2/3/4/5)</th>
              </tr>
            </thead>
            <tbody>
              {bySide(side).map((p) => (
                <tr key={p.steamid}>
                  <td>{p.name}</td>
                  {COLUMNS.map((c) => {
                    const value = p[c.key] as number;
                    return (
                      <td key={c.key} className={`right ${c.key === 'rating' ? (value >= 1.1 ? 'good' : value < 0.9 ? 'bad' : '') : ''}`}>
                        {c.digits ? value.toFixed(c.digits) : value}
                        {c.suffix}
                      </td>
                    );
                  })}
                  <td className="right muted">
                    {p.multiKills[2]}/{p.multiKills[3]}/{p.multiKills[4]}/{p.multiKills[5]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      <Card title="Rundenverlauf & Economy">
        <table className="table">
          <thead>
            <tr>
              <th>Runde</th>
              <th>Sieger</th>
              <th>Art</th>
              <th>Bombe</th>
              <th className="right">CT Equipment</th>
              <th className="right">T Equipment</th>
            </tr>
          </thead>
          <tbody>
            {[...stats.rounds].reverse().map((r) => (
              <tr key={r.round}>
                <td>{r.round}</td>
                <td className={r.winner ? `side_${r.winner}` : ''}>{r.winner ?? '—'}</td>
                <td className="muted">{r.outcome?.replace(/^(ct|t)_win_/, '') ?? '—'}</td>
                <td>{r.bombPlanted ? 'gelegt' : ''}</td>
                <td className="right">{r.economy.CT ? `$${r.economy.CT.equipment} · ${BUY[r.economy.CT.buy]}` : '—'}</td>
                <td className="right">{r.economy.T ? `$${r.economy.T.equipment} · ${BUY[r.economy.T.buy]}` : '—'}</td>
              </tr>
            ))}
            {!stats.rounds.length && (
              <tr>
                <td colSpan={6} className="muted center">
                  Noch keine abgeschlossenen Runden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
