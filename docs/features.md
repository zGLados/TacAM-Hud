# Features in detail

## Live statistics (`packages/shared/src/stats.ts`)

CS2 GSI sends **no kill events**. `inferKills(prev, cur)` therefore compares consecutive updates: increased `deaths` = victim, increased `kills` = killer (enemies preferred), increased `assists` = assister, increased `round_killhs` = headshot, the killer's active weapon = weapon. Not available: flash assists, wallbangs, no-scopes, utility damage.

`StatsTracker` per map:

| Value | Calculation |
| --- | --- |
| ADR | `round_totaldmg` at round end; the running round counts from round start |
| KAST | Round with a kill, assist, survival (HP > 0 at round end) or trade (killer dies within 5 s) |
| Opening K/D | First kill of the round |
| Clutch | Last player alive on their team vs. ≥ 1 enemy, and the team wins |
| Rating | HLTV 1.0: (KillRating + 0.7·SurvivalRating + MultiKillRating) / 2.7 |
| Economy | Equipment sum at the end of freezetime → `pistol` (round 1/13), `eco` < 5k, `semi` < 10k, `force` < 20k, otherwise `full` |

Robustness: map change / warmup → reset. **Backup restore / `mp_restartgame`**: a snapshot of the totals is stored when each round starts; if a known round starts again, the totals roll back to that snapshot and later rounds are discarded. Results and winners use CS2's MR12 / MR3 overtime (csgogsi's MR15 default is overridden).

At map end (csgogsi event `matchEnd`) the server writes score and winner into the veto of the current match and increments the series wins.

## Scenes

`SceneState { active, auto, message, countdownTo }`. Scenes: `live`, `starting`, `brb`, `pause`, `halftime`, `veto`, `scoreboard`, `matchEnd`, `upcoming`, `playerToWatch`. With `auto`, the server switches between `live` ↔ `pause` (game phase `paused`), `halftime` (map phase `intermission`, or `paused` at a half break as with `mp_halftime_pausematch`) and `matchEnd` (`gameover`), but only while one of these scenes is active. It only switches when the game phase changes, so a scene the producer picks by hand stays until the next phase change. Full-screen scenes hide the in-game HUD. Starting soon shows a countdown only when one is started in the Director (`countdownTo`); taking the scene does not start one.

- **Upcoming matches** (`upcoming`): up to 5 matches that are neither current nor finished, sorted by `startTime` (unscheduled last), with teams, format and title. Reloads every 30 s.
- **Player to watch** (`playerToWatch`): the player set in `HudConfig.playerToWatch` (Director page) with avatar, real name, team and live match stats (rating, K–D, ADR, KAST, HS, opening kills).
- **Background videos**: `Theme.backgroundVideos` play muted in random order behind starting soon, BRB and upcoming matches, with a lighter tint over them. Uploaded via `POST /api/uploads/video` (MP4/WebM, max 500 MB); OBS can play H.264, Playwright's headless shell cannot.

**Preview/program on the Director page:** with "Confirm scene changes" (default on, stored per device), clicking a scene only queues it. The queued scene is shown in a preview monitor (`/hud/?scene=<id>`) next to the live output, and goes on air with "Take" ("Discard" drops it). With the switch off, a click switches immediately.

**Fixed OBS URL per scene:** `/hud/?scene=<id>` always shows that scene and ignores the scene chosen in the control panel, so every OBS scene can have its own browser source and scenes are switched in OBS. `/hud/?scene=live` shows only the in-game HUD and never a full-screen scene. The URLs are listed in the control panel under Settings → OBS / browser source.

## Kill feed

With real CS2 data the game's own kill feed is used: run `cl_draw_only_deathnotices 1` in the observer client to hide the CS HUD except for the kill feed. The own kill feed (`HudConfig.visibility.killfeed`, off by default) is only needed when the CS HUD is hidden completely; the demo match always shows it (`GsiUpdate.demo`).

## Control panel layout

The sidebar groups the pages into **Broadcast** (Live, Director, Stats), **Data** (Matches, Teams, Players) and **Setup** (Theme, Integrations, Settings). *Integrations* has one tab each for OBS, Stream Deck / Companion, keyboard shortcuts and signals (`/control/integrations/<tab>`); *Settings* keeps game connection, OBS browser source URLs and LAN access. The Director stays a single page (everything reachable while live) with a sticky jump bar: Scenes · HUD · Overlays · Content (scene text, countdown, player to watch, trivia, previews, side boxes) · Match.

## HUD configuration ("panel")

`HudConfig`: trivia, side boxes (title/subtitle/logo), player and match preview, swap teams, keep team sides after halftime, radar size, visibility of individual elements, team logo as avatar. Changes reach all HUDs immediately via Socket.io. HUD actions (`radarBigger`, `radarSmaller`, `toggleRadarView`, `toggleHud`) are transient and come from shortcuts or buttons.

## Theme editor

`Theme.colors` → CSS variables `--color-<key>` (`primary`, `panel`, `panel-strong`, `ct`, `t`, `money`, `bomb`, `defuse`, `border`, `text`, `text-muted`), plus `--radius`, `--hud-font`, sponsors (rotation, interval; each logo can be replaced, renamed and reordered), the brand logo in the top right corner (own toggle, optional grayscale) and the tournament logo. On the first start the default sponsors and the TacAM logo are copied into the uploads (`apps/server/src/defaultMedia.ts`), so they are regular entries that can be replaced or removed; removed defaults do not come back. The preview in the editor receives unsaved changes via `postMessage` (`tacam:theme-preview`, same origin only); OBS only sees saved themes.

**Keep team sides after halftime** (`keepTeamSides`): CS2 always shows CT on the left, so teams change HUD sides at halftime. With the option on, `LiveHub` remembers per map which team (database profile, else CS team name) was on the left and sends `flip: true` in the update once it appears on the right. Only the display flips; the observer slot numbers stay the in-game ones. Coaches marked in the player database are removed from the GSI data before teams and sides are resolved, also as spectated player.

**Round rules / wingman:** `roundRules()` (`packages/shared/src/format.ts`) derives rounds per half from the GSI game mode (`scrimcomp2v2` = wingman, MR8; otherwise MR12) or from the match field `roundsPerHalf` for custom servers (e.g. 1v1 on MR6). The server applies them to csgogsi and the stats tracker and sends them in every update, so halftime detection, round label, round history and pistol rounds use the same rules in server and HUD. Team panels simply show fewer players.

**Center overlays** (`HudConfig.overlay`, `apps/hud/src/components/HudOverlay.tsx`): scoreboard, economy graph or player comparison over the live HUD, one at a time. The state lives on the server, so the Director shows what is on air and a reloaded OBS source keeps it. Scoreboard: both teams with slot, HP, K/A/D, ADR, KAST, rating and money; dead players are dimmed. Economy graph: equipment value per round for both teams (SVG, no chart library); `sideInRound()` maps each past round to the side a team played then, so a team keeps its bars across halves and overtime, and round winners are drawn at full opacity. Player comparison: two players from the running game (Director → Overlays) with rating, kills, deaths, ADR, KAST, HS %, opening kills, clutches and multi-kills; the better value is highlighted.

## Stream Deck / Companion (trigger URLs)

`apps/server/src/actions.ts` defines one-click actions (scenes, HUD toggles, overlays, swap teams, swap map sides) as `/api/trigger/<id>?key=<actionKey>`, callable with GET or POST because many button tools can only open a URL. The key lives in the settings, is required even for local requests (so a web page in the browser cannot fire actions against 127.0.0.1) and can be renewed under Integrations → Stream Deck / Companion, which also lists all URLs. From another computer the server needs LAN access. For button feedback, actions with an on/off state (scenes, toggles, overlays) report it via `/api/trigger-status/<id>?key=…&format=text` (`1`/`0`, e.g. for a Companion feedback that polls the URL) and `/api/trigger-status?key=…` (JSON with scene, overlay and all states); that tab has a “State” button per action.

## Quick setup and CSV import

- **Quick setup** (Live tab): for both sides of the running game pick an existing team or name a new one, then *Apply* (`POST /api/live/quick-setup`) creates the team, all unknown players of that side, optionally moves known players and sets the teams of the current match (or creates a current BO1). The dialog preselects a team named like the server's `mp_teamname` (`LiveSummary.gsiName`), else a new team with that name, else the team TacAM already assumes. Everything is validated before anything is created.
- **Teams CSV** (Teams → Import CSV): `name;short name;country`, matched by name; logos are added afterwards.
- **Players CSV**: teams named in the last column that do not exist yet are created first, so one file is enough.

## MatchZy server config

Matches → *MatchZy config* downloads `GET /api/matches/:id/matchzy.json` (`apps/server/src/matchzy.ts`) for the [MatchZy](https://shobhit-pathak.github.io/MatchZy/match_setup/) CS2 server plugin (Get5-style format; load it with `matchzy_loadmatch <file>`). Teams come with their players' SteamID64s (coaches left out). Once the veto has all maps, `maplist` holds them in order with `map_sides` (`team1_ct`/`team2_ct` derived from the picking team's side, `knife` for the decider) and `skip_veto: true`; before that the map pool is listed and vetoed in game. `matchid` is a stable number derived from the match id.

## Captain veto

Matches → *Captain veto* starts a veto session for a match (`apps/server/src/captainVeto.ts`, order and steps in `packages/shared/src/veto.ts`): who starts, whether the other team chooses its starting side after each pick, and the map pool (exactly as many maps as the format needs when there is a decider). The session holds three random tokens: one link per captain and one for both teams on a single device (stage/LAN). The links open `/control/veto.html?t=<token>`, a separate page without PIN login that polls `GET /api/captain/<token>` every second; `POST` makes a ban, pick or side choice. The server checks turn order, role and map availability, writes every step into `match.vetos` (so the veto scene updates live) and adds the decider automatically. `Veto.side` stores the picking team's starting side, i.e. the opposite of what the other team chose. Ending the session invalidates the links and keeps the veto; restarting creates new links and clears it. Captains on their own devices need LAN access.

## OBS WebSocket

`apps/server/src/obs.ts` connects to OBS via obs-websocket v5 (OBS 28+, Tools → WebSocket Server Settings) with `obs-websocket-js` (JSON variant). Integrations → OBS holds URL, password and a mapping TacAM scene → OBS scene; whenever the TacAM scene changes (click, automation, trigger URL), the mapped OBS scene becomes the program scene. Unmapped scenes leave OBS alone. The bridge reconnects every 5 s while enabled and reports its state and the OBS scene list (`GET /api/obs`). `ObsBridge.call()` sends any other request (used by later features such as signals or replays). Tests run against a small fake obs-websocket server (`obs.test.ts`), including the password challenge.

## Signals (game events → actions)

GSI has no events, so `detectGameEvents()` (`apps/server/src/signals.ts`) derives them from two consecutive updates: round start/live/end (with winner), bomb planted/defused/exploded, ace, match point (`winsNeeded()` incl. overtime), tactical timeout, technical pause, halftime and match end. Rules in `settings.signals` (Integrations → Signals) filter by side (CT/T) or displayed team (left/right, honoring flip and swap), wait an optional delay and run an output: a TacAM action from `actions.ts`, an HTTP request (Bitfocus Companion `POST /api/location/<page>/<row>/<column>/press`, webhooks), an OBS scene or *save replay buffer* via the OBS bridge. The last 30 fired signals with their result are listed on the page; *Test* fires one rule right away. Events also fire in the demo match.

## Keyboard shortcuts (desktop app)

`settings.keybinds` maps action ids from `actions.ts` to Electron accelerators (`""` = unbound; keys are never deleted because loading merges defaults back in). The desktop app registers them as global shortcuts and re-registers on every settings change; defaults are the earlier fixed keys (Alt+V/B/N/O/F). The editor (Integrations → Keyboard shortcuts) records a key combination, requires a modifier, and the server rejects invalid accelerators and duplicates. `Alt+H` (overlay window) stays a menu accelerator of the app window.

## Production control from a second device

Settings → enable LAN access + PIN, restart the app. The control panel shows the LAN URLs. Enter the PIN once on the other device (cookie valid for 30 days). A HUD on another PC (e.g. the OBS machine) gets `?token=<token>` appended to its URL.

## Demo match

`apps/server/src/demo.ts` simulates a complete match on de_mirage (buying, movement, kills, bomb, defuse, halftime, game over) as real GSI payloads. *Create demo data* creates matching teams, players and a BO3. Real GSI data stops the demo automatically.

## Known limitations

- No kill feed details (flash/wallbang/no-scope) and no utility damage: not in CS2 GSI.
- No player cameras (WebRTC) and no "bring your own HUD" as in JTs-Hud.
- No spectator binds tool (telnet settings are prepared).
- `react-router-dom` 6 has two moderate advisories (backslash redirect in `<Link>`, SSR hydration). Not exploitable in the panel (fixed routes only, no SSR); fixed only in v7.
