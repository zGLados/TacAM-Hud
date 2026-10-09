import { didTeamWinThatRound, type Team } from 'csgogsi';
import type { RoundRecord } from '@tacam/shared';
import { GSI } from '../state/store';
import { C4, Defuse, Hourglass, Skull } from '../lib/assets';

function OutcomeIcon({ outcome }: { outcome: string | null }) {
  if (!outcome) return <Skull />;
  if (outcome.endsWith('bomb')) return <C4 />;
  if (outcome.endsWith('defuse')) return <Defuse />;
  if (outcome.endsWith('time')) return <Hourglass />;
  return <Skull />;
}

interface Props {
  rounds: RoundRecord[];
  left: Team;
  /** map.round + 1 */
  currentRound: number;
  show: boolean;
}

/**
 * New: one tile per round. The upper marker lights up when the left team won,
 * the lower one when the right team won, colored by the side they played.
 */
export function RoundHistory({ rounds, left, currentRound, show }: Props) {
  const regulation = GSI.regulationMR * 2;
  const total = Math.max(regulation, rounds.length, currentRound - 1);
  return (
    <div className={`round-history ${show ? 'is-visible' : ''}`}>
      {Array.from({ length: total }, (_, i) => {
        const number = i + 1;
        const round = rounds.find((r) => r.round === number);
        const leftWon = round?.winner
          ? didTeamWinThatRound(left, number, round.winner, currentRound, GSI.regulationMR, GSI.overtimeMR)
          : null;
        const halfStart = number === GSI.regulationMR + 1 || number === regulation + 1;
        const marker = (won: boolean) => (
          <div className={`round-history__marker ${won ? 'is-won' : ''}`} data-side={won ? round!.winner! : undefined}>
            {won && <OutcomeIcon outcome={round!.outcome} />}
          </div>
        );
        return (
          <div key={number} className={`round-history__round ${halfStart ? 'is-half-start' : ''}`}>
            {marker(leftWon === true)}
            <div className="round-history__number">{number}</div>
            {marker(leftWon === false)}
          </div>
        );
      })}
    </div>
  );
}
