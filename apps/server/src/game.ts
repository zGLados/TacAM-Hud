import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { defaultSteamPaths } from './gsiInstall.js';

/**
 * Starting CS2 with launch options and talking to its console over
 * `-netconport` (plain TCP, line based). The console is the base for camera
 * positions/paths and the auto observer; for now it powers a test console.
 */

/** Splits launch options like a shell would for simple cases: spaces, "quoted values". */
export function parseLaunchOptions(options: string): string[] {
  const args: string[] = [];
  for (const match of options.matchAll(/"([^"]*)"|(\S+)/g)) args.push(match[1] ?? match[2]);
  return args;
}

/** Launch options with `-netconport <port>` guaranteed, so the console bridge can connect. */
export function withNetconPort(options: string, port: number) {
  return /(^|\s)-netconport(\s|$)/.test(options) ? options.trim() : `${options.trim()} -netconport ${port}`.trim();
}

function steamExecutable(steamPath: string | null) {
  if (process.platform === 'win32') {
    const roots = steamPath ? [steamPath] : defaultSteamPaths();
    for (const root of roots) {
      const exe = path.join(root, 'steam.exe');
      if (fs.existsSync(exe)) return exe;
    }
    return null;
  }
  // Linux: the steam launcher is on the PATH.
  return process.platform === 'linux' ? 'steam' : null;
}

export class GameLaunchError extends Error {}

/** `steam -applaunch 730 …` starts CS2 (and Steam if needed) without Steam's "custom arguments" prompt. */
export function launchCs2(steamPath: string | null, options: string): Promise<string[]> {
  const exe = steamExecutable(steamPath);
  if (!exe) {
    return Promise.reject(new GameLaunchError(process.platform === 'win32' ? 'steam.exe not found. Please set the Steam folder in the settings.' : 'Starting CS2 is only supported on Windows and Linux.'));
  }
  const args = ['-applaunch', '730', ...parseLaunchOptions(options)];
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', (error) => reject(new GameLaunchError(`Could not start Steam: ${error.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve(args);
    });
  });
}

/** Console connection to CS2 (`-netconport`). Keeps the last lines of console output. */
export class GameConsole {
  private socket: net.Socket | null = null;
  private connecting: Promise<void> | null = null;
  private buffer = '';
  private lines: { at: number; text: string }[] = [];
  private lastError: string | null = null;

  constructor(private target: () => { host: string; port: number }) {}

  status() {
    const { host, port } = this.target();
    const connected = !!this.socket && !this.socket.destroyed;
    return { host, port, actualHost: connected ? this.actualHost : null, connected, error: connected ? null : this.lastError, lines: this.lines.slice(-200) };
  }

  private connectedTo = '';

  /** Host the console actually answered on (may differ from the setting, see connect). */
  private actualHost: string | null = null;

  private async connect(): Promise<void> {
    const { host, port } = this.target();
    // Settings changed: drop the connection to the old address.
    if (this.socket && this.connectedTo !== `${host}:${port}`) this.disconnect();
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connectedTo = `${host}:${port}`;
    // Some setups bind the console to the PC's LAN address instead of 127.0.0.1,
    // so a refused loopback connection also tries the local IPv4 addresses.
    const candidates = isLoopback(host) ? [host, ...localIPv4()] : [host];
    this.connecting = (async () => {
      let lastError: Error | null = null;
      for (const candidate of candidates) {
        try {
          await this.open(candidate, port);
          this.actualHost = candidate;
          return;
        } catch (error) {
          lastError = error as Error;
        }
      }
      // CS2 bug on Windows: -netconport only opens the port together with -tools (Workshop Tools).
      const hint = process.platform === 'win32' ? `start CS2 with -tools -netconport ${port} (Workshop Tools needed)` : `start CS2 with -netconport ${port}`;
      this.lastError = candidates.length > 1 ? `Nothing listens on port ${port} (tried ${candidates.join(', ')}) – ${hint}` : lastError?.message ?? 'Connection failed';
      throw new Error(this.lastError);
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private open(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host, port });
      socket.setEncoding('utf8');
      socket.setTimeout(2000);
      socket.once('connect', () => {
        socket.setTimeout(0);
        this.socket = socket;
        this.lastError = null;
        resolve();
      });
      socket.once('timeout', () => socket.destroy(new Error(`No answer from ${host}:${port}`)));
      socket.on('data', (chunk: string) => this.onData(chunk));
      socket.once('error', (error) => {
        this.lastError =
          (error as NodeJS.ErrnoException).code === 'ECONNREFUSED'
            ? `Nothing listens on ${host}:${port} – start CS2 with -netconport ${port}`
            : error.message;
        reject(new Error(this.lastError));
      });
      socket.once('close', () => {
        if (this.socket === socket) this.socket = null;
      });
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? '';
    const now = Date.now();
    for (const text of parts) if (text.trim()) this.lines.push({ at: now, text });
    if (this.lines.length > 500) this.lines = this.lines.slice(-300);
  }

  /** Sends one command and returns the console lines that arrive within `waitMs`. */
  async send(command: string, waitMs = 600) {
    await this.connect();
    const since = Date.now();
    this.lines.push({ at: since, text: `] ${command}` });
    this.socket!.write(`${command}\n`);
    await new Promise((r) => setTimeout(r, waitMs));
    return this.lines.filter((l) => l.at >= since && !l.text.startsWith('] ')).map((l) => l.text);
  }

  disconnect() {
    this.socket?.destroy();
    this.socket = null;
  }
}

const isLoopback = (host: string) => host === '127.0.0.1' || host === 'localhost' || host === '::1';

function localIPv4() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

const run = (file: string, args: string[]) =>
  new Promise<string>((resolve) => execFile(file, args, { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (_e, stdout) => resolve(String(stdout ?? ''))));

/** Local addresses in LISTENING state for `port` from `netstat -ano -p tcp` output. */
export function listeningAddresses(netstat: string, port: number) {
  return netstat
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((cols) => cols.length >= 4 && /^LISTEN/i.test(cols[3]) && cols[1].endsWith(`:${port}`))
    .map((cols) => cols[1]);
}

export interface ConsoleDiagnosis {
  supported: boolean;
  cs2Running: boolean;
  /** Command line of the running cs2.exe (shows whether -netconport arrived). */
  commandLine: string | null;
  netconPort: number | null;
  /** Addresses something listens on for the configured port, e.g. 0.0.0.0:2020. */
  listening: string[];
}

/** Windows only: is CS2 running, with which options, and who listens on the console port? */
export async function diagnoseConsole(port: number): Promise<ConsoleDiagnosis> {
  if (process.platform !== 'win32') return { supported: false, cs2Running: false, commandLine: null, netconPort: null, listening: [] };
  const commandLine =
    (
      await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object Name -eq 'cs2.exe' | Select-Object -ExpandProperty CommandLine",
      ])
    ).trim() || null;
  const netstat = await run('netstat.exe', ['-ano', '-p', 'tcp']);
  const listening = listeningAddresses(netstat, port);
  const match = commandLine?.match(/-netconport\s+(\d+)/);
  return { supported: true, cs2Running: !!commandLine, commandLine, netconPort: match ? Number(match[1]) : null, listening };
}
