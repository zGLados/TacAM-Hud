// After code signing (SignPath) the installer has changed, so the hashes electron-builder
// wrote into latest.yml / beta.yml and the .blockmap no longer match – the in-app updater
// would reject the download. This rebuilds the blockmap and updates sha512 / size.
// Usage: node scripts/refresh-update-info.mjs <release dir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');

const dir = path.resolve(process.argv[2] ?? 'release');
const installers = fs.readdirSync(dir).filter((f) => f.endsWith('.exe'));
if (!installers.length) throw new Error(`No installer in ${dir}`);

const info = {};
for (const exe of installers) {
  info[exe] = await buildBlockMap(path.join(dir, exe), 'gzip', path.join(dir, `${exe}.blockmap`));
  console.log(`${exe}: ${info[exe].size} bytes, blockmap rebuilt`);
}

for (const file of fs.readdirSync(dir).filter((f) => /^(latest|beta|alpha)\.yml$/.test(f))) {
  const doc = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const entry of doc.files ?? []) {
    const fresh = info[entry.url];
    if (!fresh) continue;
    entry.sha512 = fresh.sha512;
    entry.size = fresh.size;
  }
  if (info[doc.path]) doc.sha512 = info[doc.path].sha512;
  fs.writeFileSync(path.join(dir, file), yaml.dump(doc, { lineWidth: -1 }));
  console.log(`${file}: updated`);
}
