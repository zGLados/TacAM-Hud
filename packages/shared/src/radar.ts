/**
 * Radar calibration per map (game units → pixels on the 1024×1024 radar image).
 * Used by the TacAM HUD and served to imported LHM-style HUDs (/api/game-maps/cs2).
 * Maps with two levels list one layer per level; `minHeight`/`maxHeight` decide
 * which layer a player's z position belongs to.
 */
export interface RadarLayer {
  id: string;
  originX: number;
  originY: number;
  pxPerUX: number;
  pxPerUY: number;
  /** Layer applies when z >= minHeight. */
  minHeight?: number;
  /** Layer applies when z < maxHeight. */
  maxHeight?: number;
}

export const RADAR_CALIBRATION: Record<string, RadarLayer[]> = {
  de_mirage: [{ id: 'default', originX: 645.7196725473384, originY: 340.2921393569175, pxPerUX: 0.20118507589946494, pxPerUY: -0.20138282875746794 }],
  // Updated Cache radar taken from OpenHud/JTs-Hud (7.13.26 "Cache update").
  de_cache: [{ id: 'default', originX: 361.7243823603619, originY: 579.553558767951, pxPerUX: 0.1830927328891829, pxPerUY: -0.17650705879909936 }],
  de_dust2: [{ id: 'default', originX: 563.1339320329055, originY: 736.9535330430065, pxPerUX: 0.2278315639654376, pxPerUY: -0.22776482548619972 }],
  de_inferno: [{ id: 'default', originX: 426.51386123945593, originY: 790.7266981544722, pxPerUX: 0.2041685571162696, pxPerUY: -0.20465735943851654 }],
  de_train: [{ id: 'default', originX: 527.365542903922, originY: 511.81469648562296, pxPerUX: 0.21532584158170223, pxPerUY: -0.21299254526091588 }],
  de_overpass: [{ id: 'default', originX: 927.3988878244819, originY: 343.8221009185496, pxPerUX: 0.1923720959212443, pxPerUY: -0.19427507725530338 }],
  de_ancient: [{ id: 'default', originX: 583.2590342775677, originY: 428.92222042149115, pxPerUX: 0.1983512056034216, pxPerUY: -0.20108163914549304 }],
  de_anubis: [{ id: 'default', originX: 536.3392873296655, originY: 638.0789844851904, pxPerUX: 0.1907910426894958, pxPerUY: -0.18993888105312648 }],
  de_nuke: [
    { id: 'high', originX: 473.1284773048749, originY: 165.7329003801045, pxPerUX: 0.14376095926926907, pxPerUY: -0.14736670935219626, minHeight: -450 },
    { id: 'low', originX: 473.66746071612374, originY: 638.302101754172, pxPerUX: 0.1436068746398272, pxPerUY: -0.14533406508526941, maxHeight: -450 },
  ],
  de_vertigo: [
    { id: 'high', originX: 784.4793452283254, originY: 255.42597837029027, pxPerUX: 0.19856123172015677, pxPerUY: -0.19820052722907044, minHeight: 11700 },
    { id: 'low', originX: 780.5145858437052, originY: 695.4259783702903, pxPerUX: 0.1989615567841087, pxPerUY: -0.19820052722907044, maxHeight: 11700 },
  ],
};
