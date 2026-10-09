import { useHud } from '../state/store';
import { ArmorHalf, ArmorHelmet, Bullets, Health, WeaponIcon } from '../lib/assets';
import { EquipmentIcons, useAvatar } from './TeamPanel';
import type { Player } from 'csgogsi';

function ActiveWeapon({ player }: { player: Player }) {
  const active = player.weapons.find((w) => w.state === 'active');
  if (active?.type === 'C4') return null;
  if (active?.type === 'Knife' || active?.type === 'Grenade') {
    return (
      <div className={active.type === 'Knife' ? 'focus-player__knife' : 'focus-player__grenade'}>
        <WeaponIcon weapon={active.name} active />
      </div>
    );
  }
  return (
    <div className="focus-player__ammo">
      <div className="focus-player__ammo-count">
        <div>{active?.ammo_clip || '-'}</div>
        <div>/{active ? active.ammo_reserve || '0' : ' -'}</div>
      </div>
      <div className="focus-player__ammo-icon">
        <Bullets />
      </div>
    </div>
  );
}

/** The spectated player: large avatar, health, armor, ammo and match stats. */
export function FocusPlayer() {
  const player = useHud((s) => s.game?.player ?? null);
  const stats = useHud((s) => s.stats);
  if (!player) return null;
  return <FocusPlayerCard player={player} matchStats={stats.players.find((p) => p.steamid === player.steamid)} />;
}

function FocusPlayerCard({ player, matchStats }: { player: Player; matchStats?: { adr: number; hsPercent: number } }) {
  const avatar = useAvatar(player);
  return (
    <div className="focus-player" data-side={player.team.side}>
      <div className="focus-player__portrait">
        <div className="focus-player__avatar">
          <img src={avatar} height={140} width={140} alt="Avatar" />
        </div>
      </div>
      <div className="focus-player__panel">
        <div className="focus-player__vitals">
          <div className="focus-player__icon">
            <Health />
          </div>
          <div className="focus-player__health">{player.state.health}</div>
          <div className="focus-player__icon">{player.state.helmet ? <ArmorHelmet /> : <ArmorHalf />}</div>
        </div>
        <div className="focus-player__identity">
          <div className="focus-player__name-block">
            <div className="focus-player__name">{player.name}</div>
            {matchStats && (
              <div className="focus-player__stats">
                {player.stats.kills}/{player.stats.assists}/{player.stats.deaths} · ADR {matchStats.adr} · HS {matchStats.hsPercent}%
              </div>
            )}
          </div>
        </div>
        <div className="focus-player__loadout">
          <div className="focus-player__equipment">
            <EquipmentIcons player={player} />
          </div>
          <div className="focus-player__weapon">
            <ActiveWeapon player={player} />
          </div>
        </div>
      </div>
      <div className="focus-player__health-track">
        <div className="focus-player__health-bar" style={{ width: `${player.state.health}%` }} />
      </div>
    </div>
  );
}
