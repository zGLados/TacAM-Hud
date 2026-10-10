import { useEffect, useState } from 'react';
import type { Match, TeamProfile } from '@tacam/shared';
import { useHud } from '../state/store';
import { defaultTeamLogo } from '../lib/assets';

const MAX_MATCHES = 5;
const REFRESH_MS = 30_000;
const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** A series is over once one team has won the majority of maps. */
function isFinished(match: Match) {
  const bestOf = Number(match.matchType.slice(-1));
  const needed = Math.floor(bestOf / 2) + 1;
  return match.left.wins >= needed || match.right.wins >= needed;
}

/** Next matches: not the current one, not finished, sorted by start time (unscheduled last). */
export function selectUpcoming(matches: Match[]) {
  return matches
    .filter((m) => !m.current && !isFinished(m))
    .sort((a, b) => (a.startTime ?? '￿').localeCompare(b.startTime ?? '￿'))
    .slice(0, MAX_MATCHES);
}

function useMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/matches')
        .then((r) => r.json())
        .then((data: Match[]) => active && setMatches(data))
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return matches;
}

function formatStart(startTime: string | null) {
  if (!startTime) return { day: 'TBA', time: '' };
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return { day: 'TBA', time: '' };
  return {
    day: date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

function Team({ team, align }: { team: TeamProfile | undefined; align: 'left' | 'right' }) {
  return (
    <div className="upcoming__team" data-align={align}>
      <img className="upcoming__logo" src={uploadUrl(team?.logo ?? null) ?? defaultTeamLogo(align === 'left' ? 'CT' : 'T')} alt="" />
      <span className="upcoming__team-name">{team?.name ?? 'TBD'}</span>
    </div>
  );
}

/** List of the next matches with start time, teams and format. */
export function UpcomingMatches() {
  const matches = selectUpcoming(useMatches());
  const teams = useHud((s) => s.teams);
  if (!matches.length) return <div className="scene__empty">No upcoming matches scheduled</div>;
  return (
    <div className="upcoming">
      {matches.map((match) => {
        const start = formatStart(match.startTime);
        return (
          <div key={match.id} className="upcoming__match">
            <div className="upcoming__time">
              <span className="upcoming__day">{start.day}</span>
              <span className="upcoming__clock">{start.time}</span>
            </div>
            <Team team={teams.find((t) => t.id === match.left.id)} align="left" />
            <div className="upcoming__center">
              <span className="upcoming__vs">VS</span>
              <span className="upcoming__format">{match.matchType.toUpperCase()}</span>
            </div>
            <Team team={teams.find((t) => t.id === match.right.id)} align="right" />
            <div className="upcoming__title">{match.title}</div>
          </div>
        );
      })}
    </div>
  );
}
