# Architecture

npm workspaces monorepo, TypeScript everywhere.

```
packages/shared   types, StatsTracker, kill inference, format helpers (used by everything)
apps/server       Express + Socket.io, GSI receiver, JSON store, REST API, demo match
apps/hud          React/Vite: the OBS overlay (/hud/)
apps/control      React/Vite: control panel / production control (/control/)
apps/desktop      Electron shell: runs the server in the main process, window, shortcuts
```

Server modules (`apps/server/src`):

| Module | Purpose |
| --- | --- |
| `app.ts` | server factory: Express, Socket.io, GSI receiver, static apps, wiring (one shared CS2 console connection for API, actions and camera) |
| `live.ts` | GSI pipeline (`LiveHub`): coaches, team resolution, halftime flip, round rules, stats, scene automation, game events |
| `api.ts` | REST API with zod validation |
| `store.ts` | JSON database (`db.json`) |
| `auth.ts` | LAN access with PIN/token |
| `actions.ts` | one-click actions (trigger URLs, global shortcuts) |
| `signals.ts` | game events → actions / HTTP / OBS |
| `obs.ts` | OBS WebSocket bridge |
| `captainVeto.ts` | veto links for team captains |
| `matchzy.ts` | MatchZy match config export |
| `huds.ts`, `lhm.ts` | imported HUDs (zip import) and the LHM-compatible interface they need |
| `game.ts`, `hlae.ts`, `camera.ts` | start CS2 (normal / Workshop Tools / HLAE), CS2 console over `-netconport`, HLAE install, camera views and paths |
| `demo.ts` | simulated match |
| `gsiInstall.ts`, `defaultMedia.ts`, `paths.ts` | GSI config, default sponsors/logo, data folder |

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
                                      ├─ game events → SignalEngine (actions, HTTP, OBS)
                                      └─ Socket.io: update / kill / stats / scene / live
HUD:           room "hud": raw GSI data + team extensions → its own csgogsi.digest → React
Imported HUDs: room "lhm": raw GSI data as LHM sends it (lhm.ts), plus LHM REST paths
Control:       REST + Socket.io (live, stats, scene, config, gsiStatus)
CS2 console:   TacAM ──TCP (-netconport)──▶ CS2 (camera, test console), see game.ts/camera.ts
```

The HUD parses the raw data itself (same csgogsi version) so events such as `roundEnd` are available locally. The server immediately sends the last update (`lastPayload`) to every newly connected HUD, so a reload is not empty until the next tick.

## Team assignment

csgogsi decides left/right by observer slots (lower slots = left). Which **database team** plays on which side is determined by `LiveHub.resolveTeams` from the team membership of the connected players (at least 2 players per side). Fallback: left/right team of the current match, swapped by `veto.reverseSide` if set. This keeps logos and names correct after the halftime side switch.

## Persistence

`apps/server/src/store.ts`: a single `db.json` (collections `players`, `teams`, `matches`; documents `settings`, `hudConfig`, `theme`, `scene`; `settings` also holds integrations, signals, keybinds, HUD panel values and camera views), kept in memory and written throttled and atomically (tmp + rename). On load, stored values are deep-merged over the defaults so new fields get sensible values. Deliberately no SQLite: no native modules in Electron.

Every change emits `store.on('change')`; `app.ts` then broadcasts `players`/`teams`/`match`/`config`/`theme`/`scene` to all clients.

## Security

- GSI data is only accepted with the secret token from `settings.gsiToken` (written into the installed config).
- Local requests (127.0.0.1/::1) are always allowed. Remote ones only with LAN access enabled **and** a valid token (cookie `tacam_token`, header `x-tacam-token` or `?token=`), obtained with the PIN via `/api/auth/login`. Token = HMAC(PIN), so changing the PIN invalidates old sessions.
- Uploads: image types only, 8 MB, served with a strict CSP + `nosniff` (SVGs cannot run scripts).
- Theme colors are validated by regex before they become CSS variables in the HUD.
- Electron windows: `contextIsolation`, `sandbox`, external links open in the system browser.
- Trigger URLs (`/api/trigger/…`) need the action key even locally, so a web page in the browser cannot fire actions against 127.0.0.1.
- Captain veto links carry a random token per team; they only allow the veto steps of that match.
- HUD import: zip-slip protection, size/file limits, CS2 HUDs only. An imported HUD runs its own code with access to the API – only import trusted HUDs.
- HLAE download: only from the official advancedfx GitHub release, size and SHA-256 digest checked before unpacking.
