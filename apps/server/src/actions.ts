import { timingSafeEqual } from 'node:crypto';
import { SCENE_IDS, SCENE_LABELS, type HudAction, type HudConfig } from '@tacam/shared';
import type { HudServer } from './io.js';
import { emitHudAction, emitRefresh } from './lhm.js';
import type { CameraControl } from './camera.js';
import type { LiveHub } from './live.js';
import type { Store } from './store.js';

/**
 * One-click actions for Stream Deck / Bitfocus Companion and similar tools.
 * They are reachable as `/api/trigger/<id>?key=<actionKey>` with GET or POST,
 * because many button tools can only open a URL.
 */
export interface TriggerAction {
  id: string;
  group: 'Scenes' | 'HUD' | 'Overlays' | 'Teams' | 'Camera';
  label: string;
  run: () => void;
  /** For toggles and scenes: whether the action's state is currently on (button feedback in Companion). */
  isActive?: () => boolean;
}

type VisibilityKey = keyof HudConfig['visibility'];

const OVERLAY_LABELS = { scoreboard: 'Scoreboard', economy: 'Economy graph', comparison: 'Player comparison' };

export function createActions(store: Store, live: LiveHub, io: HudServer, cameraControl?: CameraControl): TriggerAction[] {
  const config = () => store.doc('hudConfig');
  const patchConfig = (patch: Partial<HudConfig>) => store.setDoc('hudConfig', { ...config(), ...patch });
  const hudAction = (type: HudAction['type']) => () => emitHudAction(io, type);
  const toggleVisibility = (key: VisibilityKey) => () =>
    patchConfig({ visibility: { ...config().visibility, [key]: !config().visibility[key] } });
  const visible = (key: VisibilityKey) => () => config().visibility[key];

  const sceneActions: TriggerAction[] = SCENE_IDS.map((id) => ({
    id: `scene-${id}`,
    group: 'Scenes',
    label: `Scene: ${SCENE_LABELS[id]}`,
    run: () => store.setDoc('scene', { ...store.doc('scene'), active: id }),
    isActive: () => store.doc('scene').active === id,
  }));

  // Camera actions talk to CS2 over the console; failures are logged, a button press has no answer channel.
  const toCamera = (move: (camera: CameraControl) => Promise<unknown>) => () => {
    if (!cameraControl) throw new TriggerError(503, 'No CS2 console');
    void move(cameraControl).catch((error) => console.warn('Camera action failed:', (error as Error).message));
  };
  const slotName = (slot: number) => {
    const player = live.summary()?.players.find((p) => p.observerSlot === slot);
    if (!player) throw new TriggerError(404, `No player on observer slot ${slot}`);
    return player.name;
  };
  const cameraActions: TriggerAction[] = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(
      (slot): TriggerAction => ({
        id: `spectate-slot-${slot}`,
        group: 'Camera',
        label: `Spectate player on slot ${slot}`,
        run: () => {
          const name = slotName(slot); // 404 for the trigger URL before anything is sent
          toCamera((camera) => camera.spectate(name))();
        },
      })
    ),
    { id: 'spectate-next', group: 'Camera', label: 'Next player', run: toCamera((camera) => camera.step('next')) },
    { id: 'spectate-prev', group: 'Camera', label: 'Previous player', run: toCamera((camera) => camera.step('prev')) },
    { id: 'camera-free', group: 'Camera', label: 'HLAE free camera (from the current view)', run: toCamera((camera) => camera.free()) },
    { id: 'camera-release', group: 'Camera', label: 'Back to game view (end camera / path)', run: toCamera((camera) => camera.release()) },
    {
      id: 'auto-director',
      group: 'Camera',
      label: 'CS2 auto director on/off',
      run: toCamera((camera) => camera.autoDirector(!camera.state.autoDirector)),
      isActive: () => !!cameraControl?.state.autoDirector,
    },
  ];

  return [
    ...sceneActions,
    ...cameraActions,
    {
      id: 'scene-auto-toggle',
      group: 'Scenes',
      label: 'Automatic scenes on/off',
      run: () => store.setDoc('scene', { ...store.doc('scene'), auto: !store.doc('scene').auto }),
      isActive: () => store.doc('scene').auto,
    },
    { id: 'hud-toggle', group: 'HUD', label: 'Show/hide the HUD', run: hudAction('toggleHud') },
    { id: 'hud-refresh', group: 'HUD', label: 'Reload all HUDs', run: () => emitRefresh(io) },
    { id: 'radar-bigger', group: 'HUD', label: 'Radar bigger', run: hudAction('radarBigger') },
    { id: 'radar-smaller', group: 'HUD', label: 'Radar smaller', run: hudAction('radarSmaller') },
    { id: 'radar-enlarge-toggle', group: 'HUD', label: 'Enlarged radar on/off', run: hudAction('toggleRadarView') },
    { id: 'radar-toggle', group: 'HUD', label: 'Radar on/off', run: toggleVisibility('radar'), isActive: visible('radar') },
    { id: 'killfeed-toggle', group: 'HUD', label: 'Own kill feed on/off', run: toggleVisibility('killfeed'), isActive: visible('killfeed') },
    { id: 'round-history-toggle', group: 'HUD', label: 'Round history on/off', run: toggleVisibility('roundHistory'), isActive: visible('roundHistory') },
    { id: 'economy-toggle', group: 'HUD', label: 'Economy box on/off', run: toggleVisibility('economy'), isActive: visible('economy') },
    { id: 'sponsors-toggle', group: 'HUD', label: 'Sponsors on/off', run: toggleVisibility('sponsors'), isActive: visible('sponsors') },
    {
      id: 'prediction-toggle',
      group: 'HUD',
      label: 'Win probability on/off',
      run: toggleVisibility('prediction'),
      isActive: visible('prediction'),
    },
    {
      id: 'side-boxes-toggle',
      group: 'Overlays',
      label: 'Side boxes on/off',
      run: () => patchConfig({ sideBoxes: { ...config().sideBoxes, hidden: !config().sideBoxes.hidden } }),
      isActive: () => !config().sideBoxes.hidden,
    },
    {
      id: 'trivia-toggle',
      group: 'Overlays',
      label: 'Trivia on/off',
      run: () => patchConfig({ trivia: { ...config().trivia, visible: !config().trivia.visible } }),
      isActive: () => config().trivia.visible,
    },
    {
      id: 'player-preview-toggle',
      group: 'Overlays',
      label: 'Player preview on/off',
      run: () => patchConfig({ playerPreview: { ...config().playerPreview, visible: !config().playerPreview.visible } }),
      isActive: () => config().playerPreview.visible,
    },
    {
      id: 'match-preview-toggle',
      group: 'Overlays',
      label: 'Match preview on/off',
      run: () => patchConfig({ matchPreview: { ...config().matchPreview, visible: !config().matchPreview.visible } }),
      isActive: () => config().matchPreview.visible,
    },
    ...(['scoreboard', 'economy', 'comparison'] as const).map(
      (overlay): TriggerAction => ({
        id: `overlay-${overlay}`,
        group: 'Overlays',
        label: `${OVERLAY_LABELS[overlay]} on/off`,
        run: () => patchConfig({ overlay: config().overlay === overlay ? 'none' : overlay }),
        isActive: () => config().overlay === overlay,
      })
    ),
    { id: 'overlay-off', group: 'Overlays', label: 'Hide center overlay', run: () => patchConfig({ overlay: 'none' }) },
    {
      id: 'swap-teams',
      group: 'Teams',
      label: 'Swap teams left/right',
      run: () => patchConfig({ swapTeams: !config().swapTeams }),
      isActive: () => config().swapTeams,
    },
    {
      id: 'keep-sides-toggle',
      group: 'Teams',
      label: 'Keep team sides after halftime on/off',
      run: () => patchConfig({ keepTeamSides: !config().keepTeamSides }),
      isActive: () => config().keepTeamSides,
    },
    {
      id: 'swap-map-sides',
      group: 'Teams',
      label: 'Swap teams of the current map (veto)',
      run: () => {
        const match = store.list('matches').find((m) => m.current);
        const mapName = live.last?.map.name;
        if (!match || !mapName) throw new TriggerError(409, 'No running match/map');
        const vetos = match.vetos.map((v) => (mapName.endsWith(v.mapName) ? { ...v, reverseSide: !v.reverseSide } : v));
        store.update('matches', match.id, { vetos });
      },
    },
  ];
}

/** State for Companion feedback: scene, overlay and every action with an on/off state. */
export function triggerStatus(store: Store, actions: TriggerAction[]) {
  const active: Record<string, boolean> = {};
  for (const action of actions) if (action.isActive) active[action.id] = action.isActive();
  return { scene: store.doc('scene').active, overlay: store.doc('hudConfig').overlay, active };
}

/** Shortcuts of earlier versions (same as JTs-Hud / TacAM skin). */
export const DEFAULT_KEYBINDS: Record<string, string> = {
  'radar-bigger': 'Alt+V',
  'radar-smaller': 'Alt+B',
  'radar-enlarge-toggle': 'Alt+N',
  'hud-toggle': 'Alt+O',
  'hud-refresh': 'Alt+F',
};

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super', 'CommandOrControl'];
const KEY = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|num[0-9]|Space|Tab|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Plus|-|=|,|\.|\/|;|'|\[|\]|\\|`)$/;

/** Electron accelerator like "Alt+V" or "Ctrl+Shift+F5": at least one modifier and one key. */
export function isAccelerator(value: string) {
  const parts = value.split('+');
  const key = parts.pop() ?? '';
  return parts.length > 0 && parts.every((p) => MODIFIERS.includes(p)) && new Set(parts).size === parts.length && KEY.test(key);
}

export class TriggerError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function validActionKey(store: Store, key: unknown) {
  const expected = store.doc('settings').actionKey;
  if (typeof key !== 'string' || !expected) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
