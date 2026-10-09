import { memo, type FC, type SVGProps } from 'react';
import type { Side } from '@tacam/shared';

import logoCT from '../assets/images/logo_CT_default.png';
import logoT from '../assets/images/logo_T_default.png';
import playerCT from '../assets/images/player_CT_default.png';
import playerT from '../assets/images/player_T_default.png';
import flashAssist from '../assets/images/flash_assist.png';
import sponsor1 from '../assets/sponsors/sponsor1.png';
import sponsor2 from '../assets/sponsors/sponsor2.png';
import brandLogo from '../assets/sponsors/tacam_logo.png';

export { default as ArmorHalf } from '../assets/icons/icon_armor_half_default.svg?react';
export { default as ArmorHelmet } from '../assets/icons/icon_armor_half_helmet_default.svg?react';
/** Bomb carrier indicator. */
export { default as BombIcon } from '../assets/icons/icon_bomb_default.svg?react';
/** Planted bomb (timer, killfeed). */
export { default as C4 } from '../assets/icons/icon_c4_default.svg?react';
/** Small flame used for "is planting". */
export { default as SmallBomb } from '../assets/icons/bomb.svg?react';
export { default as Bullets } from '../assets/icons/icon_bullets_default.svg?react';
export { default as Defuse } from '../assets/icons/icon_defuse_default.svg?react';
export { default as Health } from '../assets/icons/icon_health_default.svg?react';
export { default as Skull } from '../assets/icons/icon_skull_default.svg?react';
export { default as Burning } from '../assets/icons/icon_burning.svg?react';
export { default as Blind } from '../assets/icons/icon_blind.svg?react';
export { default as Headshot } from '../assets/icons/headshot.svg?react';
export { default as Suicide } from '../assets/icons/suicide.svg?react';
export { default as KillsIcon } from '../assets/icons/kills.svg?react';
export { default as Hourglass } from '../assets/icons/icon_hourglass_default.svg?react';

export const images = { flashAssist };
export const defaultSponsors = [sponsor1, sponsor2];
export const defaultBrandLogo = brandLogo;

export const defaultTeamLogo = (side: Side) => (side === 'CT' ? logoCT : logoT);
export const defaultAvatar = (side: Side | undefined) => (side === 'CT' ? playerCT : playerT);

// All weapon SVGs from assets/weapons, keyed by name without the "weapon_" prefix.
const weaponModules = import.meta.glob<FC<SVGProps<SVGSVGElement>>>('../assets/weapons/*.svg', {
  query: '?react',
  import: 'default',
  eager: true,
});
const weapons: Record<string, FC<SVGProps<SVGSVGElement>>> = Object.fromEntries(
  Object.entries(weaponModules).map(([path, component]) => [path.replace(/^.*\/(.*)\.svg$/, '$1'), component])
);

interface WeaponProps extends SVGProps<SVGSVGElement> {
  weapon: string;
  active?: boolean;
  isGrenade?: boolean;
}

/** Weapon or grenade silhouette by GSI weapon name ("weapon_ak47" or "ak47"). */
export const WeaponIcon = memo(function WeaponIcon({ weapon, active, isGrenade, className, ...rest }: WeaponProps) {
  const Weapon = weapons[weapon.replace('weapon_', '')];
  if (!Weapon) return null;
  const classes = ['weapon-icon', isGrenade && 'weapon-icon--grenade', active && 'is-active', className].filter(Boolean).join(' ');
  return <Weapon fill="white" className={classes} {...rest} />;
});

// Map banners (347×50) from OpenHud, used in the map series and veto scene.
const mapBanners = import.meta.glob<string>('../assets/maps/*.png', { import: 'default', eager: true });
export const mapBanner = (mapName: string) =>
  mapBanners[`../assets/maps/${mapName.substring(mapName.lastIndexOf('/') + 1)}.png`] ?? null;
