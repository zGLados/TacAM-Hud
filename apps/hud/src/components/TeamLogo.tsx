import type { Side } from '@tacam/shared';
import { defaultTeamLogo } from '../lib/assets';

interface Props {
  team: { logo: string | null; side?: Side } | null | undefined;
  side?: Side;
  height?: number;
  width?: number;
  className?: string;
}

/** Team logo with the CT/T default logo as fallback. */
export function TeamLogo({ team, side, height, width, className = 'team-logo' }: Props) {
  if (!team) return null;
  const fallbackSide = side ?? team.side ?? 'CT';
  return (
    <div className={className}>
      <img src={team.logo || defaultTeamLogo(fallbackSide)} width={width} height={height} alt="Team logo" />
    </div>
  );
}
