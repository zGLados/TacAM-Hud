// JSON variant: OBS speaks both; JSON is easier to debug (Node would default to msgpack).
import { OBSWebSocket } from 'obs-websocket-js/json';
import type { ObsSettings, ObsStatus, SceneId } from '@tacam/shared';
import type { Store } from './store.js';

const RETRY_MS = 5000;

/**
 * Connection to OBS via obs-websocket v5 (built into OBS 28+). Switches the
 * OBS program scene along with the TacAM scene (mapping in the settings) and
 * offers single requests for other features (e.g. signals, replays).
 */
export class ObsBridge {
  private obs = new OBSWebSocket();
  private connected = false;
  private error: string | null = null;
  private scenes: string[] = [];
  private retryTimer: NodeJS.Timeout | null = null;
  private connecting = false;
  private stopped = false;
  private lastScene: SceneId;

  constructor(private store: Store) {
    this.lastScene = store.doc('scene').active;
    this.obs.on('ConnectionClosed', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.scheduleRetry();
    });
    this.obs.on('SceneListChanged', () => void this.loadScenes());
    store.on('change', (name: string) => {
      if (name === 'scene') this.onSceneChange();
      if (name === 'settings') this.reconnectIfChanged();
    });
  }

  private settings(): ObsSettings {
    return this.store.doc('settings').obs;
  }

  private lastConfig = '';

  /** Reconnects only when the connection settings changed (not on scene map edits). */
  private reconnectIfChanged() {
    const { enabled, url, password } = this.settings();
    const key = JSON.stringify([enabled, url, password]);
    if (key === this.lastConfig) return;
    this.lastConfig = key;
    void this.connect();
  }

  start() {
    this.reconnectIfChanged();
  }

  async stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.obs.disconnect().catch(() => {});
  }

  status(): ObsStatus {
    return { enabled: this.settings().enabled, connected: this.connected, error: this.error, scenes: this.scenes };
  }

  private scheduleRetry() {
    if (this.stopped || !this.settings().enabled || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, RETRY_MS);
    this.retryTimer.unref();
  }

  async connect() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await this.obs.disconnect().catch(() => {});
    this.connected = false;
    this.scenes = [];
    const { enabled, url, password } = this.settings();
    if (!enabled || this.stopped) {
      this.error = null;
      return;
    }
    if (this.connecting) return;
    this.connecting = true;
    try {
      await this.obs.connect(url, password || undefined);
      this.connected = true;
      this.error = null;
      await this.loadScenes();
    } catch (error) {
      this.error = (error as Error).message || 'Connection failed';
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  private async loadScenes() {
    try {
      const { scenes } = await this.obs.call('GetSceneList');
      // OBS lists scenes bottom-up; reverse to match the order in the OBS UI.
      this.scenes = scenes.map((s) => String(s.sceneName)).reverse();
    } catch {
      this.scenes = [];
    }
  }

  private onSceneChange() {
    const scene = this.store.doc('scene').active;
    if (scene === this.lastScene) return;
    this.lastScene = scene;
    const target = this.settings().sceneMap[scene];
    if (target && this.connected) void this.setProgramScene(target);
  }

  async setProgramScene(sceneName: string) {
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
    } catch (error) {
      this.error = `Scene "${sceneName}": ${(error as Error).message}`;
    }
  }

  /** Raw request for other features; resolves to null when OBS is not connected. */
  async call(requestType: string, requestData?: Record<string, unknown>) {
    if (!this.connected) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.obs.call as any)(requestType, requestData);
  }
}
