# Architecture

npm workspaces monorepo, TypeScript everywhere.

```
packages/shared   types, StatsTracker, kill inference, format helpers (used by everything)
apps/server       Express + Socket.io, GSI receiver, JSON store, REST API, demo match
apps/hud          React/Vite: the OBS overlay (/hud/)
apps/control      React/Vite: control panel / production control (/control/)
apps/desktop      Electron shell: runs the server in the main process, window, shortcuts
```

## Ports

| Port | Purpose | Binding |
| --- | --- | --- |
| 1349 | HTTP (HUD, control, API, uploads) + Socket.io | `127.0.0.1`, `0.0.0.0` with LAN access |
| 23415 | GSI receiver (CS2 → POST `/`) | always `127.0.0.1` |

Override with `HUD_PORT` / `GSI_PORT`.

## Data flow

```
CS2 ──POST (token)──▶ GSI server ──▶ LiveHub.ingest(raw)
                                      ├─ filter out coaches
                                      ├─ resolve teams (resolveTeams)
                                      ├─ csgogsi.digest → CSGO
                                      ├─ StatsTracker.update → kill events + stats
                                      ├─ scene automation
                                      └─ Socket.io: update / kill / stats / scene / live
HUD:     raw GSI data + team extensions → its own csgogsi.digest → React
Control: REST + Socket.io (live, stats, scene, config, gsiStatus)
```

The HUD parses the raw data itself (same csgogsi version) so events such as `roundEnd` are available locally. The server immediately sends the last update (`lastPayload`) to every newly connected HUD, so a reload is not empty until the next tick.

## Team assignment

csgogsi decides left/right by observer slots (lower slots = left). Which **database team** plays on which side is determined by `LiveHub.resolveTeams` from the team membership of the connected players (at least 2 players per side). Fallback: left/right team of the current match, swapped by `veto.reverseSide` if set. This keeps logos and names correct after the halftime side switch.

## Persistence

`apps/server/src/store.ts`: a single `db.json` (collections `players`, `teams`, `matches`; documents `settings`, `hudConfig`, `theme`, `scene`), kept in memory and written throttled and atomically (tmp + rename). On load, stored values are deep-merged over the defaults so new fields get sensible values. Deliberately no SQLite: no native modules in Electron.

Every change emits `store.on('change')`; `app.ts` then broadcasts `players`/`teams`/`match`/`config`/`theme`/`scene` to all clients.

## Security

- GSI data is only accepted with the secret token from `settings.gsiToken` (written into the installed config).
- Local requests (127.0.0.1/::1) are always allowed. Remote ones only with LAN access enabled **and** a valid token (cookie `tacam_token`, header `x-tacam-token` or `?token=`), obtained with the PIN via `/api/auth/login`. Token = HMAC(PIN), so changing the PIN invalidates old sessions.
- Uploads: image types only, 8 MB, served with a strict CSP + `nosniff` (SVGs cannot run scripts).
- Theme colors are validated by regex before they become CSS variables in the HUD.
- Electron windows: `contextIsolation`, `sandbox`, external links open in the system browser.
