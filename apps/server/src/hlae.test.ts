import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { installHlae, installedHlae } from './hlae.js';

let server: Server | null = null;
const dirs: string[] = [];
afterEach(() => {
  server?.close();
  server = null;
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Serves `zip` once and returns a release pointing at it. */
async function serve(zip: Uint8Array, digest?: string) {
  server = createServer((_req, res) => res.end(Buffer.from(zip)));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { version: 'v2.192.7', url: `http://127.0.0.1:${port}/hlae.zip`, size: zip.length, digest: digest ?? `sha256:${createHash('sha256').update(zip).digest('hex')}` };
}

const dataDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tacam-hlae-'));
  dirs.push(d);
  return d;
};

const hlaeZip = (extra: Record<string, string> = {}) =>
  zipSync(Object.fromEntries(Object.entries({ 'HLAE.exe': 'exe', 'x64/AfxHookSource2.dll': 'dll', ...extra }).map(([k, v]) => [k, strToU8(v)])));

describe('HLAE install', () => {
  it('installs a verified release and replaces an older one', async () => {
    const dir = dataDir();
    expect(installedHlae(dir)).toBeNull();
    const installed = await installHlae(dir, await serve(hlaeZip()));
    expect(installed).toEqual({ version: 'v2.192.7', path: path.join(dir, 'hlae', 'HLAE.exe') });
    expect(fs.existsSync(path.join(dir, 'hlae', 'x64', 'AfxHookSource2.dll'))).toBe(true);

    server!.close();
    fs.writeFileSync(path.join(dir, 'hlae', 'old-file.txt'), 'x');
    await installHlae(dir, { ...(await serve(hlaeZip())), version: 'v2.193.0' });
    expect(installedHlae(dir)?.version).toBe('v2.193.0');
    expect(fs.existsSync(path.join(dir, 'hlae', 'old-file.txt'))).toBe(false);
  });

  it('rejects a wrong checksum, missing files and paths outside the folder', async () => {
    const dir = dataDir();
    await expect(installHlae(dir, await serve(hlaeZip(), 'sha256:00'))).rejects.toThrow('Checksum');
    server!.close();
    await expect(installHlae(dir, await serve(zipSync({ 'readme.txt': strToU8('x') })))).rejects.toThrow('HLAE.exe missing');
    server!.close();
    await expect(installHlae(dir, await serve(hlaeZip({ '../evil.txt': 'x' })))).rejects.toThrow('Invalid path');
    expect(fs.existsSync(path.join(dir, 'evil.txt'))).toBe(false);
    expect(installedHlae(dir)).toBeNull();
  });
});
