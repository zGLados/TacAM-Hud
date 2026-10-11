# Interfaces

All paths are below `http://localhost:1349/api`. Bodies are JSON and validated with zod (400 with an error text for invalid data).

## REST

| Method & path | Purpose |
| --- | --- |
| `GET /bootstrap` | Everything a HUD needs on startup (`HudBootstrap`) |
| `GET/POST /players`, `PUT/DELETE /players/:id` | Players (SteamID64 = 17 digits, unique → 409) |
| `POST /players/import` | Array of players, upsert by SteamID |
| `GET/POST /teams`, `PUT/DELETE /teams/:id` | Teams (deleting removes the players' team assignment) |
| `GET/POST /matches`, `PUT/DELETE /matches/:id` | Matches incl. veto; only one match is `current` |
| `GET /matches/current` | Current match |
| `POST /matches/:id/current` | Set/unset as current |
| `POST /matches/:id/reverse-current-map` | Toggle `reverseSide` of the running map |
| `POST /uploads` (multipart `file`) | Upload an image (max 8 MB) → `{ file, url }`; `DELETE /uploads/:file` |
| `POST /uploads/video` (multipart `file`) | Upload a background video (MP4/WebM, max 500 MB) → `{ file, url }` |
| `GET/PUT /hud/config` | HUD configuration |
| `POST /hud/action` | `{ type: 'radarBigger' \| 'radarSmaller' \| 'toggleRadarView' \| 'toggleHud' }` |
| `POST /hud/refresh` | Reload all HUDs |
| `GET/PUT /theme`, `GET/PUT /scene` | Theme, scene |
| `GET /live` | `{ status, summary }` |
| `GET /live/raw` | Last raw GSI payload (debugging, test fixtures) |
| `GET /stats`, `POST /stats/reset`, `GET /killfeed` | Statistics |
| `GET/PUT /settings` | Steam path, LAN access, PIN, telnet; GET also returns `gsiPort`, `cs2CfgDir`, `gsiInstalled`, `addresses` |
| `POST /settings/install-gsi`, `GET /settings/gsi-config` | Install / download the GSI config |
| `GET /demo`, `POST /demo/start`, `POST /demo/stop`, `POST /demo/seed` | Demo match |
| `POST /auth/login` `{ pin }`, `GET /auth/status` | LAN login |
| `GET /matches/:id/matchzy.json` | MatchZy match config (download) |
| `POST /teams/import` `[{ name, shortName, country }]` | Team CSV import (matched by name) |
| `POST /live/quick-setup` `{ left, right, reassign, setMatch }` | Live tab quick setup (`left`/`right`: `{ teamId }` or `{ name, shortName }`) |
| `GET /actions` | Trigger actions (id, group, label) |
| `POST /game/launch` | Start CS2 with the launch options and launch mode |
| `GET /camera-control`, `POST /camera-control/check`, `POST/PUT /camera-control/shots`, `DELETE /camera-control/shots/:id`, `POST /camera-control/shots/:id/go`, `POST /camera-control/path` `{ shotIds, duration, hold }`, `POST /camera-control/release`, `POST /camera-control/free`, `PUT /camera-control/options` `{ freeCameraOnMapLoad?, mapLoadCommands?, menuCommands? }`, `POST /camera-control/spectate` `{ steamid }`, `POST /camera-control/step` `{ direction: 'next' \| 'prev' }` | Camera control via HLAE (views, jumps, paths) and player selection |
| `GET /hlae[?check=1]`, `POST /hlae/install` | Installed/latest HLAE; install or update HLAE from the advancedfx GitHub releases |
| `GET /game/console[?connect=1]`, `POST /game/console` `{ command }`, `GET /game/console/diagnose` | CS2 console over -netconport: state + recent lines, send a command, Windows diagnosis |
| `GET /huds`, `POST /huds/import` (zip body), `DELETE /huds/:dir` | Imported HUDs |
| `GET` / `PUT /huds/:dir/panel`, `POST /huds/:dir/action` `{ action, data? }`, `POST /huds/:dir/keybind` `{ action }` | Settings panel, panel actions and keybinds of an imported HUD |
| LHM paths (`/match`, `/match/current`, `/teams/:id`, `/teams/logo/:id`, `/players/avatar/steamid/:id`, `/game-maps/cs2`, …) | Data for imported HUDs, see features.md |
| `PUT /settings/signals` `[rule]`, `GET /signals/log`, `POST /signals/test` `rule` | Signals: save rules, recent results, fire one rule |
| `GET /obs`, `PUT /settings/obs` `{ enabled, url, password, sceneMap }` | OBS connection state and settings |
| `POST /matches/:id/captain-veto` `{ first, sideChoice, pool? }`, `DELETE /matches/:id/captain-veto` | Start/end a captain veto (returns the match with `captainVeto.tokens`) |
| `GET` / `POST /captain/:token` `{ action: 'ban'\|'pick', map }` or `{ action: 'side', side }` | Captain veto page; the token replaces the PIN |
| `GET /trigger-status?key=` · `GET /trigger-status/:id?key=[&format=text]` | State for button feedback (scene, overlay, on/off per action; text = `1`/`0`) |
| `GET` or `POST /trigger/:id?key=<actionKey>` (or header `x-tacam-key`) | Run a trigger action (Stream Deck, Companion). The key is required even for local requests; `POST /settings/action-key` creates a new one |

Static paths: `/hud/`, `/control/`, `/uploads/<file>`.

Error messages in API responses are English and shown directly in the control panel.

## Socket.io

Client → server: `hello('hud' | 'control')` (join a room).

Server → client (types in `packages/shared/src/types.ts`, `ServerToClientEvents`):

| Event | Payload | Recipients |
| --- | --- | --- |
| `update` | `{ raw, teams: { left, right } }`: raw GSI data + team extensions | all |
| `kill` | `KillFeedEntry` | all |
| `stats` | `StatsSnapshot` (on kills / round end) | all |
| `config` / `theme` / `scene` / `match` / `teams` / `players` | after changes | all |
| `action` | HUD action | all |
| `refresh` | reload the page | all |
| `live` | `LiveSummary` (max. 2/s) | `control` |
| `gsiStatus` | `{ connected, lastUpdate, map, phase }` (every 2 s) | `control` |

## GSI

CS2 posts to `http://127.0.0.1:23415/` with `auth.token`. The config (`gamestate_integration_tacam.cfg`) is generated by `apps/server/src/gsiInstall.ts` and written to `<Steam library>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/`.
