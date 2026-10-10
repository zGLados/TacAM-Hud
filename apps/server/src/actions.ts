import { timingSafeEqual } from 'node:crypto';
import { SCENE_IDS, SCENE_LABELS, type HudAction, type HudConfig } from '@tacam/shared';
import type { HudServer } from './io.js';
import type { LiveHub } from './live.js';
import type { Store } from './store.js';

/**
 * One-click actions for Stream Deck / Bitfocus Companion and similar tools.
 * They are reachable as `/api/trigger/<id>?key=<actionKey>` with GET or POST,
 * because many button tools can only open a URL.
 */
export interface TriggerAction {
  id: string;
  group: 'Scenes' | 'HUD' | 'Overlays' | 'Teams';
  label: string;
  run: () => void;
}

type VisibilityKey = keyof HudConfig['visibility'];

const OVERLAY_LABELS = { scoreboard: 'Scoreboard', economy: 'Economy graph', comparison: 'Player comparison' };

export function createActions(store: Store, live: LiveHub, io: HudServer): TriggerAction[] {
  const config = () => store.doc('hudConfig');
  const patchConfig = (patch: Partial<HudConfig>) => store.setDoc('hudConfig', { ...config(), ...patch });
  const hudAction = (type: HudAction['type']) => () => io.emit('action', { type });
  const toggleVisibility = (key: VisibilityKey) => () =>
    patchConfig({ visibility: { ...config().visibility, [key]: !config().visibility[key] } });

  const sceneActions: TriggerAction[] = SCENE_IDS.map((id) => ({
    id: `scene-${id}`,
    group: 'Scenes',
    label: `Scene: ${SCENE_LABELS[id]}`,
    run: () => store.setDoc('scene', { ...store.doc('scene'), active: id }),
  }));

  return [
    ...sceneActions,
    {
      id: 'scene-auto-toggle',
      group: 'Scenes',
      label: 'Automatic scenes on/off',
      run: () => store.setDoc('scene', { ...store.doc('scene'), auto: !store.doc('scene').auto }),
    },
    { id: 'hud-toggle', group: 'HUD', label: 'Show/hide the HUD', run: hudAction('toggleHud') },
    { id: 'hud-refresh', group: 'HUD', label: 'Reload all HUDs', run: () => io.emit('refresh') },
    { id: 'radar-bigger', group: 'HUD', label: 'Radar bigger', run: hudAction('radarBigger') },
    { id: 'radar-smaller', group: 'HUD', label: 'Radar smaller', run: hudAction('radarSmaller') },
    { id: 'radar-enlarge-toggle', group: 'HUD', label: 'Enlarged radar on/off', run: hudAction('toggleRadarView') },
    { id: 'radar-toggle', group: 'HUD', label: 'Radar on/off', run: toggleVisibility('radar') },
    { id: 'killfeed-toggle', group: 'HUD', label: 'Own kill feed on/off', run: toggleVisibility('killfeed') },
    { id: 'round-history-toggle', group: 'HUD', label: 'Round history on/off', run: toggleVisibility('roundHistory') },
    { id: 'economy-toggle', group: 'HUD', label: 'Economy box on/off', run: toggleVisibility('economy') },
    { id: 'sponsors-toggle', group: 'HUD', label: 'Sponsors on/off', run: toggleVisibility('sponsors') },
    {
      id: 'side-boxes-toggle',
      group: 'Overlays',
      label: 'Side boxes on/off',
      run: () => patchConfig({ sideBoxes: { ...config().sideBoxes, hidden: !config().sideBoxes.hidden } }),
    },
    {
      id: 'trivia-toggle',
      group: 'Overlays',
      label: 'Trivia on/off',
      run: () => patchConfig({ trivia: { ...config().trivia, visible: !config().trivia.visible } }),
    },
    {
      id: 'player-preview-toggle',
      group: 'Overlays',
      label: 'Player preview on/off',
      run: () => patchConfig({ playerPreview: { ...config().playerPreview, visible: !config().playerPreview.visible } }),
    },
    {
      id: 'match-preview-toggle',
      group: 'Overlays',
      label: 'Match preview on/off',
      run: () => patchConfig({ matchPreview: { ...config().matchPreview, visible: !config().matchPreview.visible } }),
    },
    ...(['scoreboard', 'economy', 'comparison'] as const).map(
      (overlay): TriggerAction => ({
        id: `overlay-${overlay}`,
        group: 'Overlays',
        label: `${OVERLAY_LABELS[overlay]} on/off`,
        run: () => patchConfig({ overlay: config().overlay === overlay ? 'none' : overlay }),
      })
    ),
    { id: 'overlay-off', group: 'Overlays', label: 'Hide center overlay', run: () => patchConfig({ overlay: 'none' }) },
    { id: 'swap-teams', group: 'Teams', label: 'Swap teams left/right', run: () => patchConfig({ swapTeams: !config().swapTeams }) },
    {
      id: 'keep-sides-toggle',
      group: 'Teams',
      label: 'Keep team sides after halftime on/off',
      run: () => patchConfig({ keepTeamSides: !config().keepTeamSides }),
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
