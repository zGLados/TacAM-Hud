import type { Bomb, CSGO, Grenade, Player } from 'csgogsi';
import { normalizeMapName } from '@tacam/shared';
import { GSI, useHud } from '../../state/store';
import { RADAR_CONTENT_TOP, RADAR_MAPS, type RadarMap, type RadarTransform } from './maps';

/** Space between the map strip and the visible radar image. */
const RADAR_GAP = 6;

const PLAYER_SIZE = 70;
const SMOKE_SIZE = 50;
const FRAG_LIFETIME = 1.6;
const FLASH_LIFETIME = 1.45;
const HISTORY = 5;

// Positions are averaged over the last few updates to smooth out jitter.
const playerHistory: Player[][] = [];
const grenadeHistory: Grenade[][] = [];
const rotationCache: Record<string, number> = {};
const explodedFragPositions: Record<string, number[]> = {};
const weaponCache: Record<string, { ammo: number; weapon: string; lastShot: number }> = {};

GSI.prependListener('data', (data: CSGO) => {
  grenadeHistory.unshift(data.grenades);
  grenadeHistory.splice(HISTORY);
  playerHistory.unshift(data.players);
  playerHistory.splice(HISTORY);

  // Remember where frags exploded, the GSI keeps moving them afterwards.
  const last = GSI.last;
  if (!last) return;
  for (const nade of data.grenades) {
    if (nade.type !== 'frag') continue;
    const previous = last.grenades.find((g) => g.id === nade.id);
    if (previous && nade.lifetime >= FRAG_LIFETIME && previous.lifetime < FRAG_LIFETIME) {
      explodedFragPositions[nade.id] = nade.position;
    }
  }
  for (const id of Object.keys(explodedFragPositions)) {
    if (!data.grenades.some((g) => g.id === id)) delete explodedFragPositions[id];
  }
});

const snap = (n: number) => Math.round(n / 0.02) * 0.02;
const toRadar = (pos: number[], t: RadarTransform): [number, number] => [
  snap(t.origin.x + pos[0] * t.pxPerUX),
  snap(t.origin.y + pos[1] * t.pxPerUY),
];

/** Smoothly accumulated rotation so the view cone never spins the long way round. */
function rotation(player: Player) {
  if (rotationCache[player.steamid] !== undefined && !player.state.health) return rotationCache[player.steamid];
  const [fx, fy] = player.forward;
  const [asin, acos] = [Math.asin(fx), Math.acos(fy)].map((r) => (r * 180) / Math.PI);
  let angle = acos < 45 ? Math.abs(asin) : acos > 135 ? 180 - Math.abs(asin) : acos;
  if (asin < 0) angle = -(angle - 360);
  if (rotationCache[player.steamid] === undefined) rotationCache[player.steamid] = angle;
  const current = rotationCache[player.steamid];
  let delta = current - 360 * Math.floor(current / 360);
  delta = -(delta - angle);
  if (Math.abs(delta) > 180) delta -= (360 * Math.abs(delta)) / delta;
  rotationCache[player.steamid] += delta;
  return rotationCache[player.steamid];
}

function averagePlayer(player: Player, t: RadarTransform): [number, number, number] {
  const samples = playerHistory
    .map((list) => list.find((p) => p.steamid === player.steamid))
    .filter((p): p is Player => !!p)
    .map((p) => toRadar(p.position, t));
  if (!samples.length) return [0, 0, 0];
  const x = samples.reduce((s, p) => s + p[0], 0) / samples.length;
  const y = samples.reduce((s, p) => s + p[1], 0) / samples.length;
  return [x, y, rotation(player)];
}

function averageGrenade(nade: Grenade, t: RadarTransform): [number, number] | null {
  if (nade.id in explodedFragPositions) return toRadar(explodedFragPositions[nade.id], t);
  const samples = grenadeHistory
    .map((list) => list.find((g) => g.id === nade.id))
    .filter((g): g is Grenade => !!g && 'position' in g)
    .map((g) => toRadar((g as { position: number[] }).position, t));
  if (!samples.length) return 'position' in nade ? toRadar(nade.position, t) : null;
  return [samples.reduce((s, p) => s + p[0], 0) / samples.length, samples.reduce((s, p) => s + p[1], 0) / samples.length];
}

const layers = (map: RadarMap) =>
  'config' in map ? [{ id: 'main', config: map.config, isVisible: () => true }] : map.configs;

interface RadarPlayer {
  id: string;
  label: string | number;
  side: string;
  position: [number, number, number];
  visible: boolean;
  active: boolean;
  scale: number;
  flashed: boolean;
  shooting: boolean;
  alive: boolean;
  hasBomb: boolean;
}

function radarPlayers(player: Player, observed: string | null, map: RadarMap): RadarPlayer[] {
  const active = player.weapons.find((w) => w.state === 'active' && !['C4', 'Knife', 'Grenade'].includes(w.type ?? ''));
  const now = { ammo: active?.ammo_clip ?? 0, weapon: active?.name ?? '', lastShot: 0 };
  const before = weaponCache[player.steamid] ?? now;
  const shot = now.weapon === before.weapon && now.ammo < before.ammo;
  now.lastShot = shot ? Date.now() : before.lastShot;
  weaponCache[player.steamid] = now;

  return layers(map).map((layer) => ({
    id: `${player.steamid}_${layer.id}`,
    label: player.observer_slot ?? '',
    side: player.team.side,
    position: averagePlayer(player, layer.config),
    visible: layer.isVisible(player.position[2]),
    active: observed === player.steamid,
    scale: layer.config.originHeight === undefined ? 1 : 1 + (player.position[2] - layer.config.originHeight) / 1000,
    flashed: player.state.flashed > 35,
    shooting: Date.now() - now.lastShot <= 250,
    alive: player.state.health > 0,
    hasBomb: player.weapons.some((w) => w.type === 'C4'),
  }));
}

interface RadarNade {
  id: string;
  type: string;
  state: 'inair' | 'landed' | 'exploded';
  side: string;
  position: [number, number];
  visible: boolean;
}

function radarGrenades(nade: Grenade, side: string, map: RadarMap): RadarNade[] {
  if (nade.type === 'inferno') {
    return nade.flames.flatMap((flame) =>
      layers(map).map((layer) => ({
        id: `${flame.id}_${nade.id}_${layer.id}`,
        type: 'inferno',
        state: 'landed' as const,
        side,
        position: toRadar(flame.position, layer.config),
        visible: layer.isVisible(flame.position[2]),
      }))
    );
  }
  return layers(map).flatMap((layer) => {
    const position = averageGrenade(nade, layer.config);
    if (!position) return [];
    let state: RadarNade['state'] = 'inair';
    if (nade.type === 'smoke' && nade.effecttime !== 0) state = nade.effecttime >= 16.5 ? 'exploded' : 'landed';
    if ((nade.type === 'flashbang' && nade.lifetime >= FLASH_LIFETIME) || (nade.type === 'frag' && nade.lifetime >= FRAG_LIFETIME)) {
      state = 'exploded';
    }
    return [{ id: `${nade.id}_${layer.id}`, type: nade.type, state, side, position, visible: layer.isVisible(nade.position[2]) }];
  });
}

const transform = (x: number, y: number, scale: string) =>
  `translateX(${x.toFixed(2)}px) translateY(${y.toFixed(2)}px) translateZ(10px) scale(${scale})`;

function BombMarker({ bomb, map }: { bomb: Bomb | null; map: RadarMap }) {
  if (!bomb || bomb.state === 'carried' || bomb.state === 'planting') return null;
  return (
    <>
      {layers(map).map((layer) => {
        const [x, y] = toRadar(bomb.position, layer.config);
        return (
          <div
            key={`bomb_${layer.id}`}
            className={`radar__bomb ${layer.isVisible(bomb.position[2]) ? '' : 'is-hidden'}`}
            data-state={bomb.state}
            style={{ transform: transform(x, y, '1') }}
          >
            <div className="radar__marker">
              <div className="radar__blast" />
              <div className="radar__sprite" />
            </div>
          </div>
        );
      })}
    </>
  );
}

export function Radar({ game, size }: { game: CSGO; size: number }) {
  const cameraMode = useHud((s) => s.camera.mode);
  const mapName = normalizeMapName(game.map.name);
  const offset = (size - (size * size) / 1024) / 2;
  // The map is drawn 1.15× larger around its center (radar.css), so it starts
  // 0.075·size above the box; shift it so the image content starts GAP below the strip.
  const contentTop = RADAR_CONTENT_TOP[mapName] ?? 0;
  const marginTop = RADAR_GAP + 0.075 * size - (contentTop * 1.15 * size) / 1024;
  const style = { width: size, height: size, transform: `scale(${size / 1024})`, top: -offset, left: -offset, marginTop };
  const map = RADAR_MAPS[mapName];
  if (!map) {
    return (
      <div className="radar" style={style}>
        Unsupported map
      </div>
    );
  }
  // No observed marker while a HLAE camera / path shows the map instead of a player.
  const observed = cameraMode === 'game' ? (game.player?.steamid ?? null) : null;
  const players = game.players.flatMap((p) => radarPlayers(p, observed, map));
  const grenades = game.grenades.flatMap((g) =>
    radarGrenades(g, game.players.find((p) => p.steamid === g.owner)?.team.side ?? 'CT', map)
  );

  return (
    <div className="radar" style={style}>
      <div className="radar__map" style={{ backgroundImage: `url(${map.file})` }}>
        {players.map((p) => {
          const state = [p.shooting && 'is-shooting', p.flashed && 'is-flashed', p.hasBomb && 'has-bomb', p.active && 'is-focused', !p.alive && 'is-dead', !p.visible && 'is-hidden'];
          return (
            <div
              key={p.id}
              className={['radar__player', ...state].filter(Boolean).join(' ')}
              data-side={p.side}
              style={{ transform: transform(p.position[0], p.position[1], '1') }}
            >
              <div className="radar__marker" style={{ width: PLAYER_SIZE * p.scale, height: PLAYER_SIZE * p.scale }}>
                <div className="radar__muzzle" style={{ transform: `rotate(${-90 + p.position[2]}deg)`, opacity: p.shooting ? 1 : 0 }}>
                  <div className="radar__muzzle-flash" />
                </div>
                <div className="radar__sprite" style={{ transform: `rotate(${45 + p.position[2]}deg)` }} />
                <div className="radar__label">{p.label}</div>
              </div>
            </div>
          );
        })}
        {grenades.map((g) => (
          <div
            key={g.id}
            className={`radar__grenade ${g.visible ? '' : 'is-hidden'}`}
            data-type={g.type}
            data-state={g.state}
            data-side={g.side}
            style={{ transform: transform(g.position[0], g.position[1], '1') }}
          >
            <div className="radar__marker" style={g.type === 'smoke' && g.state !== 'inair' ? { width: SMOKE_SIZE, height: SMOKE_SIZE } : undefined}>
              <div className="radar__blast" />
              <div className="radar__sprite" />
            </div>
          </div>
        ))}
        <BombMarker bomb={game.bomb} map={map} />
      </div>
    </div>
  );
}
