import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { unzipSync } from 'fflate';

/**
 * HLAE (advancedfx) managed by TacAM: downloaded from the official GitHub
 * releases, checked against the size and SHA-256 GitHub publishes for the
 * asset, and unpacked to `<dataDir>/hlae`. Used by the HLAE launch mode.
 */

const RELEASES = 'https://api.github.com/repos/advancedfx/advancedfx/releases/latest';
const VERSION_FILE = 'tacam-version.txt';

export interface HlaeRelease {
  version: string;
  url: string;
  size: number;
  /** "sha256:<hex>" as published by GitHub; null for old releases without digest. */
  digest: string | null;
}

export class HlaeError extends Error {}

export const hlaeDir = (dataDir: string) => path.join(dataDir, 'hlae');

export function installedHlae(dataDir: string) {
  const dir = hlaeDir(dataDir);
  const exe = path.join(dir, 'HLAE.exe');
  if (!fs.existsSync(exe)) return null;
  const versionFile = path.join(dir, VERSION_FILE);
  return { version: fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : null, path: exe };
}

let latestCache: { at: number; release: HlaeRelease } | null = null;

/** Latest HLAE release (cached for 10 minutes; GitHub limits anonymous API calls). */
export async function latestHlae(): Promise<HlaeRelease> {
  if (latestCache && Date.now() - latestCache.at < 10 * 60_000) return latestCache.release;
  const res = await fetch(RELEASES, { headers: { 'User-Agent': 'TacAM-HUD', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new HlaeError(`GitHub answered ${res.status} – try again later`);
  const data = (await res.json()) as { tag_name: string; assets: { name: string; size: number; digest?: string | null; browser_download_url: string }[] };
  const asset = data.assets.find((a) => /^hlae_[\d_]+\.zip$/i.test(a.name));
  if (!asset) throw new HlaeError('No HLAE zip in the latest release');
  const release = { version: data.tag_name, url: asset.browser_download_url, size: asset.size, digest: asset.digest ?? null };
  latestCache = { at: Date.now(), release };
  return release;
}

const cs2Running = () =>
  process.platform !== 'win32'
    ? Promise.resolve(false)
    : new Promise<boolean>((resolve) =>
        execFile('tasklist.exe', ['/FI', 'IMAGENAME eq cs2.exe', '/NH'], { windowsHide: true, timeout: 8000 }, (_e, out) => resolve(/cs2\.exe/i.test(String(out ?? ''))))
      );

/** Downloads, verifies and unpacks `release` to `<dataDir>/hlae`, replacing an older version. */
export async function installHlae(dataDir: string, release: HlaeRelease) {
  if (await cs2Running()) throw new HlaeError('CS2 is running – close it first, HLAE is in use while the game runs.');
  const res = await fetch(release.url, { headers: { 'User-Agent': 'TacAM-HUD' }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new HlaeError(`Download failed (${res.status})`);
  const zip = new Uint8Array(await res.arrayBuffer());
  if (zip.length !== release.size) throw new HlaeError('Download incomplete (size does not match)');
  if (release.digest) {
    const [algorithm, expected] = release.digest.split(':');
    const actual = createHash(algorithm === 'sha256' ? 'sha256' : 'sha512').update(zip).digest('hex');
    if (actual !== expected) throw new HlaeError('Checksum does not match the release – download rejected');
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new HlaeError('The download is not a valid zip');
  }

  const target = hlaeDir(dataDir);
  const tmp = `${target}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/')) continue;
      const out = path.resolve(tmp, name);
      if (!out.startsWith(tmp + path.sep)) throw new HlaeError(`Invalid path in zip: ${name}`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
    }
    for (const required of ['HLAE.exe', path.join('x64', 'AfxHookSource2.dll')]) {
      if (!fs.existsSync(path.join(tmp, required))) throw new HlaeError(`${required} missing in the HLAE release`);
    }
    fs.writeFileSync(path.join(tmp, VERSION_FILE), release.version);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
  return installedHlae(dataDir)!;
}
