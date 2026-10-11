import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from './store.js';
import { seedDefaultMedia } from './defaultMedia.js';

const dirs: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-media-'));
  dirs.push(dir);
  return dir;
};
const stores: Store[] = [];
const newStore = (dir: string) => {
  const store = new Store(dir);
  stores.push(store);
  return store;
};
afterEach(() => {
  // A throttled write (200 ms) must not land after the folder is gone (flaky ENOENT in CI).
  for (const store of stores.splice(0)) store.flush();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const hudDir = tempDir();
  fs.mkdirSync(path.join(hudDir, 'defaults'));
  for (const name of ['sponsor1.png', 'sponsor2.png', 'brand-logo.png']) {
    fs.writeFileSync(path.join(hudDir, 'defaults', name), name);
  }
  const dataDir = tempDir();
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir);
  return { hudDir, dataDir, uploadsDir };
}

describe('seedDefaultMedia', () => {
  it('copies the default sponsors and brand logo into uploads on first start', () => {
    const { hudDir, dataDir, uploadsDir } = setup();
    const store = newStore(dataDir);
    seedDefaultMedia(store, uploadsDir, hudDir);
    const theme = store.doc('theme');
    expect(theme.sponsors.map((s) => s.label)).toEqual(['Clutch Kings', 'Donzo Community']);
    expect(theme.brandLogo).toMatch(/\.png$/);
    for (const file of [...theme.sponsors.map((s) => s.file), theme.brandLogo!]) {
      expect(fs.existsSync(path.join(uploadsDir, file))).toBe(true);
    }
  });

  it('does not bring back sponsors the user removed', () => {
    const { hudDir, dataDir, uploadsDir } = setup();
    const store = newStore(dataDir);
    seedDefaultMedia(store, uploadsDir, hudDir);
    store.setDoc('theme', { ...store.doc('theme'), sponsors: [] });
    seedDefaultMedia(store, uploadsDir, hudDir);
    expect(store.doc('theme').sponsors).toEqual([]);
  });

  it('keeps sponsors that already exist', () => {
    const { hudDir, dataDir, uploadsDir } = setup();
    const store = newStore(dataDir);
    const own = [{ id: 'x', file: 'own.png', label: 'Own' }];
    store.setDoc('theme', { ...store.doc('theme'), sponsors: own });
    seedDefaultMedia(store, uploadsDir, hudDir);
    expect(store.doc('theme').sponsors).toEqual(own);
  });
});
