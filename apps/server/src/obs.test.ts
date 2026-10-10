import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { ObsBridge } from './obs.js';
import { Store } from './store.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64');

/** Minimal obs-websocket v5 server: auth handshake, GetSceneList, SetCurrentProgramScene. */
function fakeObs(password: string) {
  const wss = new WebSocketServer({ port: 0, handleProtocols: () => 'obswebsocket.json' });
  const state = { program: 'Start', switches: [] as string[] };
  const salt = 'salt';
  const challenge = 'challenge';
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, authentication: { salt, challenge } } }));
    socket.on('message', (raw) => {
      const { op, d } = JSON.parse(String(raw));
      if (op === 1) {
        if (d.authentication !== sha256(sha256(password + salt) + challenge)) return socket.close(4009, 'Authentication failed');
        return socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      }
      if (op !== 6) return;
      const reply = (responseData: object = {}) =>
        socket.send(JSON.stringify({ op: 7, d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData } }));
      if (d.requestType === 'GetSceneList') {
        reply({ currentProgramSceneName: state.program, scenes: [{ sceneName: 'Live', sceneIndex: 0 }, { sceneName: 'Pause', sceneIndex: 1 }, { sceneName: 'Start', sceneIndex: 2 }] });
      } else if (d.requestType === 'SetCurrentProgramScene') {
        state.program = d.requestData.sceneName;
        state.switches.push(state.program);
        reply();
      } else reply();
    });
  });
  const port = () => (wss.address() as { port: number }).port;
  return { wss, state, port };
}

const waitFor = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup) await fn();
  cleanup = [];
});

describe('ObsBridge', () => {
  it('connects with the password and switches OBS scenes along with TacAM scenes', async () => {
    const obs = fakeObs('secret');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-obs-'));
    const store = new Store(dir);
    const bridge = new ObsBridge(store);
    cleanup.push(async () => {
      await bridge.stop();
      obs.wss.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    store.setDoc('settings', {
      ...store.doc('settings'),
      obs: { enabled: true, url: `ws://127.0.0.1:${obs.port()}`, password: 'secret', sceneMap: { pause: 'Pause', live: 'Live' } },
    });
    bridge.start();
    await waitFor(() => bridge.status().connected);
    await waitFor(() => bridge.status().scenes.length > 0);
    expect(bridge.status().scenes).toEqual(['Start', 'Pause', 'Live']);

    store.setDoc('scene', { ...store.doc('scene'), active: 'pause' });
    await waitFor(() => obs.state.program === 'Pause');
    store.setDoc('scene', { ...store.doc('scene'), active: 'brb' }); // not mapped: OBS stays
    store.setDoc('scene', { ...store.doc('scene'), active: 'live' });
    await waitFor(() => obs.state.program === 'Live');
    expect(obs.state.switches).toEqual(['Pause', 'Live']);
  });

  it('reports a wrong password instead of connecting', async () => {
    const obs = fakeObs('secret');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-obs-'));
    const store = new Store(dir);
    const bridge = new ObsBridge(store);
    cleanup.push(async () => {
      await bridge.stop();
      obs.wss.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    store.setDoc('settings', { ...store.doc('settings'), obs: { enabled: true, url: `ws://127.0.0.1:${obs.port()}`, password: 'wrong', sceneMap: {} } });
    bridge.start();
    await waitFor(() => !!bridge.status().error);
    expect(bridge.status().connected).toBe(false);
  });
});
