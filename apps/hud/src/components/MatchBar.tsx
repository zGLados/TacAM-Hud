import { useEffect, useRef, useState } from 'react';
import type { Player, Team } from 'csgogsi';
import { formatClock, formatRoundLabel, type Match } from '@tacam/shared';
import { GSI, useHud } from '../state/store';
import { useGsiEvent, useSides } from '../state/hooks';
import { C4, Defuse, SmallBomb } from '../lib/assets';
import { TeamLogo } from './TeamLogo';

const DURATION = { planting: 3, defuseKit: 5, defuseNoKit: 10, bomb: 40 };

/** Snaps to the GSI value when local interpolation drifted more than 2 s. */
const resync = (local: number, server: number) => (Math.abs(local - server) > 2 ? server : local);

/** Bomb plant/defuse/explosion countdowns, interpolated between GSI updates. */
export function useBombTimers() {
  const [bomb, setBomb] = useState<{ state: string | null; player: Player | null }>({ state: null, player: null });
  const [plantTime, setPlantTime] = useState(0);
  const [defuseTime, setDefuseTime] = useState(0);
  const [bombTime, setBombTime] = useState(0);
  const lastFrame = useRef(0);

  useGsiEvent('data', (data) => {
    const state = data.bomb?.state ?? null;
    const countdown = data.bomb?.countdown ?? 0;
    setBomb({ state, player: data.bomb?.player ?? null });
    setPlantTime((t) => resync(t, state === 'planting' ? countdown : 0));
    setDefuseTime((t) => resync(t, state === 'defusing' ? countdown : 0));
    setBombTime((t) => (state === 'planted' ? resync(t, countdown) : t));
  });

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      if (lastFrame.current) {
        const delta = (now - lastFrame.current) / 1000;
        const dec = (t: number) => (t <= 0 ? 0 : t - delta);
        setPlantTime(dec);
        setDefuseTime(dec);
        setBombTime(dec);
      }
      lastFrame.current = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { ...bomb, plantTime, defuseTime, bombTime };
}

interface PlantDefuseTimer {
  type: 'planting' | 'defusing';
  time: number;
  player: Player | null;
}

function BombActionBar({ timer, align }: { timer: PlantDefuseTimer | null; align: 'left' | 'right' }) {
  if (!timer) return null;
  const total =
    timer.type === 'planting' ? DURATION.planting : timer.player?.state.defusekit ? DURATION.defuseKit : DURATION.defuseNoKit;
  return (
    <div className="bomb-action" data-align={align}>
      <div className="bomb-action__caption">
        {timer.player &&
          (timer.type === 'defusing' ? (
            <>
              <Defuse height={22} width={22} fill="var(--color-ct)" />
              <div>{timer.player.name} is defusing</div>
            </>
          ) : (
            <>
              <SmallBomb height={22} fill="var(--color-t)" />
              <div>{timer.player.name} is planting</div>
            </>
          ))}
      </div>
      <div className="bomb-action__progress" style={{ width: `${(timer.time * 100) / total}%` }} />
    </div>
  );
}

function MatchBarTeam({ team, align, timer }: { team: Team; align: 'left' | 'right'; timer: PlantDefuseTimer | null }) {
  const [showWin, setShowWin] = useState(false);
  useGsiEvent('roundEnd', (score) => {
    if (score.winner.orientation !== team.orientation) return;
    setShowWin(true);
    setTimeout(() => setShowWin(false), 5000);
  });
  return (
    <>
      <div className="match-bar__team" data-align={align} data-side={team.side}>
        <div className="match-bar__team-name">{team.name}</div>
        <TeamLogo team={team} className="match-bar__logo" />
      </div>
      <BombActionBar timer={timer} align={align} />
      <div className={`round-win-banner ${showWin ? 'is-visible' : ''}`} data-align={align} data-side={team.side}>
        WINS THE ROUND!
      </div>
    </>
  );
}

export function MatchBar() {
  const game = useHud((s) => s.game);
  const sides = useSides();
  const bomb = useBombTimers();
  if (!game || !sides) return null;

  const bombActive = game.bomb?.state === 'planted' || game.bomb?.state === 'defusing';
  const plant: PlantDefuseTimer | null = bomb.state === 'planting' ? { type: 'planting', time: bomb.plantTime, player: bomb.player } : null;
  const defuse: PlantDefuseTimer | null = bomb.state === 'defusing' ? { type: 'defusing', time: bomb.defuseTime, player: bomb.player } : null;
  const timerFor = (team: Team) => (team.side === 'CT' ? defuse : plant);

  return (
    <div className="match-bar">
      <MatchBarTeam team={sides.left} align="left" timer={timerFor(sides.left)} />
      <div className="match-bar__score" data-align="left" data-side={sides.left.side}>
        {sides.left.score}
      </div>
      <div className="match-bar__clock">
        <div className={`match-bar__time ${bombActive ? 'is-hidden' : ''}`}>{formatClock(game.phase_countdowns.phase_ends_in)}</div>
        <div className={`match-bar__round ${bombActive ? 'is-hidden' : ''}`}>
          {formatRoundLabel(game.map.round, GSI.regulationMR, GSI.overtimeMR)}
        </div>
        <div className="bomb-timer">
          <div className={`bomb-timer__fill ${bombActive ? 'is-visible' : ''}`} style={{ height: `${(bomb.bombTime * 100) / DURATION.bomb}%` }} />
          <div className={`bomb-timer__icon ${bombActive ? 'is-visible' : ''}`}>
            <C4 fill="white" />
          </div>
        </div>
      </div>
      <div className="match-bar__score" data-align="right" data-side={sides.right.side}>
        {sides.right.score}
      </div>
      <MatchBarTeam team={sides.right} align="right" timer={timerFor(sides.right)} />
    </div>
  );
}

/** Series score below the match bar: one box per map needed to win, plus "BEST OF X". */
export function SeriesBar() {
  const sides = useSides();
  const match = useHud((s) => s.match);
  if (!sides) return null;
  const bestOf = match ? Number(match.matchType.slice(-1)) : 0;
  const needed = bestOf ? Math.floor(bestOf / 2) + 1 : 0;
  const wins = (team: Team, align: 'left' | 'right') => (
    <div className="series-bar__team" data-align={align}>
      <div className="series-bar__wins">
        {Array.from({ length: needed }, (_, i) => (
          <div key={i} className={`series-bar__win ${seriesWins(team, match) > i ? 'is-won' : ''}`} data-side={team.side} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="series-bar">
      {wins(sides.left, 'left')}
      <div className="series-bar__label">{bestOf ? `BEST OF ${bestOf}` : ''}</div>
      {wins(sides.right, 'right')}
    </div>
  );
}

/** Map wins come from the match in the database, falling back to the GSI series counter. */
export function seriesWins(team: Team, match: Match | null) {
  if (match && team.id) {
    if (match.left.id === team.id) return match.left.wins;
    if (match.right.id === team.id) return match.right.wins;
  }
  return team.matches_won_this_series;
}
