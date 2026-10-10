import net from 'node:net';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { GameConsole, listeningAddresses, parseLaunchOptions, withNetconPort } from './game.js';

let servers: net.Server[] = [];
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});

const received: string[] = [];

/** Minimal stand-in for the CS2 netcon: answers commands like the game console. */
async function fakeConsole() {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.on('data', (data: string) => {
      for (const line of data.split('\n').filter(Boolean)) {
        received.push(line);
        if (line.startsWith('engine_no_focus_sleep')) continue;
        if (line === 'getpos') socket.write('setpos 1.000000 2.000000 3.000000;setang 4.000000 5.000000 0.000000\r\n');
        else if (line.startsWith('echo ')) socket.write(`${line.slice(5)}\n`);
        else socket.write(`Unknown command "${line.split(' ')[0]}"\n`);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return (server.address() as net.AddressInfo).port;
}

describe('CS2 launch options', () => {
  it('splits options and keeps quoted values together', () => {
    expect(parseLaunchOptions('-novid  -netconport 2020 +exec "my config.cfg"')).toEqual(['-novid', '-netconport', '2020', '+exec', 'my config.cfg']);
  });

  it('adds -netconport only when it is missing', () => {
    expect(withNetconPort('-novid', 2020)).toBe('-novid -netconport 2020');
    expect(withNetconPort('', 2121)).toBe('-netconport 2121');
    expect(withNetconPort('-netconport 2121 -novid', 2020)).toBe('-netconport 2121 -novid');
  });
});

describe('GameConsole', () => {
  it('sends commands and returns the answer lines', async () => {
    const port = await fakeConsole();
    const target = { host: '127.0.0.1', port };
    const console = new GameConsole(() => target);
    expect(await console.send('getpos', 200)).toEqual(['setpos 1.000000 2.000000 3.000000;setang 4.000000 5.000000 0.000000']);
    expect(await console.send('spec_lerpto 1 2 3', 200)).toEqual(['Unknown command "spec_lerpto"']);
    expect(console.status()).toMatchObject({ connected: true, error: null });
    expect(console.status().lines.map((l) => l.text)).toContain('] getpos');
    expect(received).toContain('engine_no_focus_sleep 0');

    // a changed address reconnects
    target.port = await fakeConsole();
    expect(await console.send('echo moved', 200)).toEqual(['moved']);
    console.disconnect();
  });

  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  it.skipIf(!lan)('finds a console that only listens on the LAN address', async () => {
    const server = net.createServer((socket) => socket.on('data', () => socket.write('pong\n')));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, lan, () => r()));
    const port = (server.address() as net.AddressInfo).port;
    const console = new GameConsole(() => ({ host: '127.0.0.1', port }));
    expect(await console.send('ping', 200)).toEqual(['pong']);
    expect(console.status()).toMatchObject({ connected: true, actualHost: lan });
    console.disconnect();
  });

  it('explains how to fix a refused connection', async () => {
    const port = await fakeConsole();
    servers[0].close();
    await new Promise((r) => setTimeout(r, 50));
    const console = new GameConsole(() => ({ host: '127.0.0.1', port }));
    await expect(console.send('getpos')).rejects.toThrow(`-netconport ${port}`);
  });
});

describe('console diagnosis', () => {
  it('finds the addresses listening on the console port in netstat output', () => {
    const netstat = [
      '',
      'Active Connections',
      '',
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1032',
      '  TCP    192.168.1.20:2020      0.0.0.0:0              LISTENING       8812',
      '  TCP    127.0.0.1:20200        0.0.0.0:0              LISTENING       4410',
      '  TCP    192.168.1.20:2020      192.168.1.5:51544      ESTABLISHED     8812',
    ].join('\r\n');
    expect(listeningAddresses(netstat, 2020)).toEqual(['192.168.1.20:2020']);
    expect(listeningAddresses(netstat, 2121)).toEqual([]);
  });
});
