import mirage from '../../assets/radar/mirage.png';
import cache from '../../assets/radar/cache.png';
import dust2 from '../../assets/radar/dust2.png';
import inferno from '../../assets/radar/inferno.png';
import train from '../../assets/radar/train.png';
import overpass from '../../assets/radar/overpass.png';
import nuke from '../../assets/radar/nuke.png';
import vertigo from '../../assets/radar/vertigo.png';
import ancient from '../../assets/radar/ancient.png';
import anubis from '../../assets/radar/anubis.png';
import { RADAR_CALIBRATION, type RadarLayer } from '@tacam/shared';

/** Maps game units to pixels on the 1024×1024 radar image. */
export interface RadarTransform {
  origin: { x: number; y: number };
  pxPerUX: number;
  pxPerUY: number;
  originHeight?: number;
}

export interface SingleLayerMap {
  config: RadarTransform;
  file: string;
}

export interface MultiLayerMap {
  configs: { id: string; config: RadarTransform; isVisible: (height: number) => boolean }[];
  file: string;
}

/**
 * First non-transparent pixel row of each radar image (of 1024). Used to place
 * the visible map directly below the map strip regardless of the image padding.
 */
export const RADAR_CONTENT_TOP: Record<string, number> = {
  de_ancient: 72,
  de_anubis: 26,
  de_cache: 175,
  de_dust2: 21,
  de_inferno: 53,
  de_mirage: 159,
  de_nuke: 29,
  de_overpass: 13,
  de_train: 129,
  de_vertigo: 34,
};

export type RadarMap = SingleLayerMap | MultiLayerMap;

const FILES: Record<string, string> = {
  de_mirage: mirage,
  de_cache: cache,
  de_dust2: dust2,
  de_inferno: inferno,
  de_train: train,
  de_overpass: overpass,
  de_nuke: nuke,
  de_vertigo: vertigo,
  de_ancient: ancient,
  de_anubis: anubis,
};

const transform = (l: RadarLayer): RadarTransform => ({ origin: { x: l.originX, y: l.originY }, pxPerUX: l.pxPerUX, pxPerUY: l.pxPerUY });

/** Radar maps built from the shared calibration (packages/shared/src/radar.ts). */
export const RADAR_MAPS: Record<string, RadarMap> = Object.fromEntries(
  Object.entries(RADAR_CALIBRATION).map(([name, layers]) => [
    name,
    layers.length === 1
      ? { config: transform(layers[0]), file: FILES[name] }
      : {
          file: FILES[name],
          configs: layers.map((l) => ({
            id: l.id,
            config: transform(l),
            isVisible: (h: number) => (l.minHeight === undefined || h >= l.minHeight) && (l.maxHeight === undefined || h < l.maxHeight),
          })),
        },
  ])
);
