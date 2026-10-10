import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from './store.js';

/** Default sponsor images shipped in the HUD build (`apps/hud/public/defaults`). */
const DEFAULT_SPONSORS = [
  { file: 'sponsor1.png', label: 'Clutch Kings' },
  { file: 'sponsor2.png', label: 'Donzo Community' },
];
const DEFAULT_BRAND_LOGO = 'brand-logo.png';

/**
 * Copies the default sponsors and brand logo into the uploads folder once, so
 * they show up in the theme editor and can be replaced or removed like any
 * other upload. Runs only on the first start (flag in settings) so deleted
 * sponsors do not come back.
 */
export function seedDefaultMedia(store: Store, uploadsDir: string, hudDir: string | undefined) {
  const settings = store.doc('settings');
  if (settings.defaultMediaSeeded || !hudDir) return;
  const defaultsDir = path.join(hudDir, 'defaults');
  if (!fs.existsSync(defaultsDir)) return;

  const copy = (name: string) => {
    const source = path.join(defaultsDir, name);
    if (!fs.existsSync(source)) return null;
    const target = `${randomUUID()}${path.extname(name)}`;
    fs.copyFileSync(source, path.join(uploadsDir, target));
    return target;
  };

  const theme = store.doc('theme');
  const sponsors = theme.sponsors.length
    ? theme.sponsors
    : DEFAULT_SPONSORS.flatMap(({ file, label }) => {
        const copied = copy(file);
        return copied ? [{ id: randomUUID(), file: copied, label }] : [];
      });
  const brandLogo = theme.brandLogo ?? copy(DEFAULT_BRAND_LOGO);
  store.setDoc('theme', { ...theme, sponsors, brandLogo });
  store.setDoc('settings', { ...settings, defaultMediaSeeded: true });
}
