import { memo } from 'react';
import type { Player, Team } from 'csgogsi';
import { useHud } from '../state/store';
import { ArmorHalf, ArmorHelmet, BombIcon, Defuse, KillsIcon, Skull, WeaponIcon, defaultAvatar } from '../lib/assets';

/** Avatar respecting the "team logo as avatar" option from the control panel. */
export function useAvatar(player: Player) {
  const mode = useHud((s) => s.config.replaceAvatars);
  const logo = player.team.logo;
  if (logo && (mode === 'always' || (mode === 'if_missing' && !player.avatar))) return logo;
  return player.avatar || defaultAvatar(player.team.side);
}

/** Bomb carrier / defuse kit icons, shared by player cards and the focus player. */
export function EquipmentIcons({ player }: { player: Player }) {
  const hasBomb = player.weapons.some((w) => w.type === 'C4');
  const hasKit = !!player.state.health && !!player.state.defusekit;
  return (
    <>
      {hasBomb && (
        <div className="equipment-icon--bomb">
          <BombIcon />
        </div>
      )}
      {hasKit && (
        <div className="equipment-icon--kit">
          <Defuse />
        </div>
      )}
    </>
  );
}

function PlayerCard({ player, isFocused }: { player: Player; isFocused: boolean }) {
  const avatar = useAvatar(player);
  const weapons = player.weapons.map((w) => ({ ...w, name: w.name.replace('weapon_', '') }));
  const primary = weapons.find((w) => !['C4', 'Pistol', 'Knife', 'Grenade', undefined].includes(w.type)) ?? null;
  const secondary = weapons.find((w) => w.type === 'Pistol') ?? null;
  const zeus = weapons.find((w) => w.name === 'taser');
  const grenades = weapons.filter((w) => w.type === 'Grenade');
  const shown = primary ?? secondary ?? zeus ?? null;
  const { state, stats } = player;

  return (
    <div className={`player-card ${state.health === 0 ? 'is-dead' : ''} ${isFocused ? 'is-focused' : ''}`}>
      <div className="player-card__body">
        <div className="player-card__slot">{player.observer_slot}</div>
        <div className="player-card__top">
          <div className="player-card__avatar">
            <img src={avatar} height={57} width={57} alt="Avatar" />
          </div>
          <div className="player-card__equipment">
            <EquipmentIcons player={player} />
          </div>
          <div className="player-card__info">
            <div className="player-card__name-row">
              <div className="player-card__name">{player.name}</div>
              {state.round_kills > 0 && <div className="player-card__round-kills">{state.round_kills}</div>}
            </div>
            <div className="player-card__stats">
              <div className="player-card__stat">
                <KillsIcon />
                <div>{stats.kills}</div>
              </div>
              <div className="player-card__stat">
                <Skull />
                <div>{stats.deaths}</div>
              </div>
              <div className="player-card__money">${state.money}</div>
            </div>
          </div>
        </div>
        <div className="player-card__bottom">
          <div className="player-card__round-damage">ROUND DMG: {state.round_totaldmg}</div>
          <div className="player-card__health-trail" style={{ width: `${state.health}%` }} />
          <div className="player-card__health-bar" style={{ width: `${state.health}%` }} />
          <div className="player-card__vitals">
            <div className="player-card__health">{state.health > 0 && state.health}</div>
            {state.health > 0 && state.armor > 0 && (
              <div className="player-card__armor">{state.helmet ? <ArmorHelmet /> : <ArmorHalf />}</div>
            )}
          </div>
          <div className="player-card__loadout">
            <div className="player-card__grenades">
              {grenades.map((g) => [
                <WeaponIcon key={`${g.name}-${g.state}`} weapon={g.name} active={g.state === 'active'} isGrenade />,
                g.ammo_reserve === 2 ? <WeaponIcon key={`${g.name}-${g.state}-double`} weapon={g.name} isGrenade /> : null,
              ])}
            </div>
            {shown && <WeaponIcon weapon={shown.name} active={shown.state === 'active'} />}
          </div>
        </div>
      </div>
    </div>
  );
}

const MemoPlayerCard = memo(PlayerCard);

/** The five player cards of one team, bottom left or bottom right. */
export function TeamPanel({ team, players, align }: { team: Team; players: Player[]; align: 'left' | 'right' }) {
  const focused = useHud((s) => s.game?.player?.steamid ?? null);
  return (
    <div className="team-panel" data-align={align} data-side={team.side}>
      {players.map((p) => (
        <MemoPlayerCard key={p.steamid} player={p} isFocused={focused === p.steamid} />
      ))}
    </div>
  );
}
