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

const single = (x: number, y: number, pxPerUX: number, pxPerUY: number, file: string): SingleLayerMap => ({
  config: { origin: { x, y }, pxPerUX, pxPerUY },
  file,
});

export const RADAR_MAPS: Record<string, RadarMap> = {
  de_mirage: single(645.7196725473384, 340.2921393569175, 0.20118507589946494, -0.20138282875746794, mirage),
  // Updated Cache radar taken from OpenHud/JTs-Hud (7.13.26 "Cache update").
  de_cache: single(361.7243823603619, 579.553558767951, 0.1830927328891829, -0.17650705879909936, cache),
  de_dust2: single(563.1339320329055, 736.9535330430065, 0.2278315639654376, -0.22776482548619972, dust2),
  de_inferno: single(426.51386123945593, 790.7266981544722, 0.2041685571162696, -0.20465735943851654, inferno),
  de_train: single(527.365542903922, 511.81469648562296, 0.21532584158170223, -0.21299254526091588, train),
  de_overpass: single(927.3988878244819, 343.8221009185496, 0.1923720959212443, -0.19427507725530338, overpass),
  de_ancient: single(583.2590342775677, 428.92222042149115, 0.1983512056034216, -0.20108163914549304, ancient),
  de_anubis: single(536.3392873296655, 638.0789844851904, 0.1907910426894958, -0.18993888105312648, anubis),
  de_nuke: {
    file: nuke,
    configs: [
      {
        id: 'high',
        config: { origin: { x: 473.1284773048749, y: 165.7329003801045 }, pxPerUX: 0.14376095926926907, pxPerUY: -0.14736670935219626 },
        isVisible: (h) => h >= -450,
      },
      {
        id: 'low',
        config: { origin: { x: 473.66746071612374, y: 638.302101754172 }, pxPerUX: 0.1436068746398272, pxPerUY: -0.14533406508526941 },
        isVisible: (h) => h < -450,
      },
    ],
  },
  de_vertigo: {
    file: vertigo,
    configs: [
      {
        id: 'high',
        config: { origin: { x: 784.4793452283254, y: 255.42597837029027 }, pxPerUX: 0.19856123172015677, pxPerUY: -0.19820052722907044 },
        isVisible: (h) => h >= 11700,
      },
      {
        id: 'low',
        config: { origin: { x: 780.5145858437052, y: 695.4259783702903 }, pxPerUX: 0.1989615567841087, pxPerUY: -0.19820052722907044 },
        isVisible: (h) => h < 11700,
      },
    ],
  },
};
