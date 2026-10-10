import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { findCs2CfgDir } from './gsiInstall.js';

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

export class GameLaunchError extends Error {}

const runOk = (file: string, args: string[]) =>
  new Promise<string>((resolve) => execFile(file, args, { windowsHide: true, timeout: 8000 }, (_e, stdout) => resolve(String(stdout ?? ''))));

/**
 * Options for the game: -tools also gets -noassetbrowser (no asset browser window),
 * and +engine_no_focus_sleep 0 so CS2 keeps rendering from the first second when
 * the observer tabs out (sent on connect as well, but that may be too late).
 * `borderless` runs CS2 as a borderless window: exclusive fullscreen stops drawing
 * on focus loss.
 */
export function gameArgs(options: string, borderless = false) {
  const args = parseLaunchOptions(options);
  if (args.includes('-tools') && !args.includes('-noassetbrowser')) args.push('-noassetbrowser');
  if (!args.includes('+engine_no_focus_sleep')) args.push('+engine_no_focus_sleep', '0');
  if (borderless) {
    for (const flag of ['-windowed', '-noborder']) if (!args.includes(flag)) args.push(flag);
  }
  return args;
}

export interface LaunchSettings {
  steamPath: string | null;
  options: string;
  mode: 'normal' | 'tools' | 'hlae';
  hlaePath: string;
  borderless: boolean;
}

/** Game options for a launch mode: -tools for Workshop Tools, -insecure -afxFixNetCon for HLAE. */
export function launchArgs(options: string, mode: LaunchSettings['mode'], borderless: boolean) {
  const extra = mode === 'tools' ? '-tools' : mode === 'hlae' ? '-insecure -afxFixNetCon' : '';
  return gameArgs(`${extra} ${options}`.trim(), borderless).filter((a, i, all) => !a.startsWith('-') || all.indexOf(a) === i);
}

/**
 * Windows: runs cs2.exe from the CS2 folder directly with the options (Steam must
 * run), like CS Demo Manager does – `steam -applaunch` does not reliably pass
 * options like -tools on. In HLAE mode HLAE starts cs2.exe with its hook
 * (also like CS Demo Manager); -afxFixNetCon makes -netconport work without -tools.
 * Linux: `steam -applaunch 730 …`.
 */
export async function launchCs2(settings: LaunchSettings): Promise<string[]> {
  const args = launchArgs(settings.options, settings.mode, settings.borderless);
  if (process.platform === 'win32') {
    const cfgDir = findCs2CfgDir(settings.steamPath);
    // …/game/csgo/cfg → …/game/bin/win64/cs2.exe
    const exe = cfgDir ? path.join(cfgDir, '..', '..', 'bin', 'win64', 'cs2.exe') : null;
    if (!exe || !fs.existsSync(exe)) throw new GameLaunchError('cs2.exe not found. Please set the Steam folder in the settings.');
    const tasks = await runOk('tasklist.exe', ['/FI', 'IMAGENAME eq steam.exe', '/NH']);
    if (!/steam\.exe/i.test(tasks)) throw new GameLaunchError('Steam is not running. Start Steam, log in, then try again.');
    if (/cs2\.exe/i.test(await runOk('tasklist.exe', ['/FI', 'IMAGENAME eq cs2.exe', '/NH']))) {
      throw new GameLaunchError('CS2 is already running. Close it completely first, otherwise the launch options do not apply.');
    }
    if (settings.mode === 'hlae') {
      const hlae = settings.hlaePath.trim();
      if (!hlae || !fs.existsSync(hlae)) throw new GameLaunchError('HLAE.exe not found. Set the path to HLAE.exe in the settings (download HLAE from advancedfx.org).');
      const hook = path.join(path.dirname(hlae), 'x64', 'AfxHookSource2.dll');
      if (!fs.existsSync(hook)) throw new GameLaunchError(`AfxHookSource2.dll not found next to HLAE (${hook}). Is HLAE up to date?`);
      await spawnDetached(hlae, ['-noGui', '-autoStart', '-noConfig', '-afxDisableSteamStorage', '-customLoader', '-hookDllPath', hook, '-programPath', exe, '-cmdLine', args.join(' ')], path.dirname(hlae));
      return args;
    }
    await spawnDetached(exe, args, path.dirname(exe));
    return args;
  }
  if (settings.mode === 'hlae') throw new GameLaunchError('HLAE only runs on Windows.');
  if (process.platform === 'linux') {
    await spawnDetached('steam', ['-applaunch', '730', ...args]);
    return args;
  }
  throw new GameLaunchError('Starting CS2 is only supported on Windows and Linux.');
}

function spawnDetached(file: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', (error) => reject(new GameLaunchError(`Could not start ${path.basename(file)}: ${error.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
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
    return { host, port, connected, error: connected ? null : this.lastError, lines: this.lines.slice(-200) };
  }

  private connectedTo = '';

  private connect(): Promise<void> {
    const { host, port } = this.target();
    // Settings changed: drop the connection to the old address.
    if (this.socket && this.connectedTo !== `${host}:${port}`) this.disconnect();
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connectedTo = `${host}:${port}`;
    this.connecting = this.open(host, port)
      .then(() => {
        // Keep rendering at full speed while the observer works in another window
        // (TacAM, OBS); with -tools the game otherwise appears to freeze when unfocused.
        this.lines.push({ at: Date.now(), text: '] engine_no_focus_sleep 0 (sent automatically)' });
        this.socket?.write('engine_no_focus_sleep 0\n');
      })
      .finally(() => {
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
        // CS2 bug on Windows: -netconport only opens the port together with -tools (Workshop Tools).
        const hint = process.platform === 'win32' ? `start CS2 via HLAE or with -tools (Settings → launch mode)` : `start CS2 with -netconport ${port}`;
        this.lastError = (error as NodeJS.ErrnoException).code === 'ECONNREFUSED' ? `Nothing listens on ${host}:${port} – ${hint}` : error.message;
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
