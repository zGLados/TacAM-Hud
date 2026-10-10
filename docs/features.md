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

`SceneState { active, auto, message, countdownTo }`. Scenes: `live`, `starting`, `brb`, `pause`, `halftime`, `veto`, `scoreboard`, `matchEnd`, `upcoming`, `playerToWatch`. With `auto`, the server switches between `live` ↔ `pause` (game phase `paused`), `halftime` (map phase `intermission`) and `matchEnd` (`gameover`), but only while one of these scenes is active; scenes picked by the producer stay. Full-screen scenes hide the in-game HUD.

- **Upcoming matches** (`upcoming`): up to 5 matches that are neither current nor finished, sorted by `startTime` (unscheduled last), with teams, format and title. Reloads every 30 s.
- **Player to watch** (`playerToWatch`): the player set in `HudConfig.playerToWatch` (Regie page) with avatar, real name, team and live match stats (rating, K–D, ADR, KAST, HS, opening kills).
- **Background videos**: `Theme.backgroundVideos` play muted in random order behind starting soon, BRB and upcoming matches, with a lighter tint over them. Uploaded via `POST /api/uploads/video` (MP4/WebM, max 500 MB); OBS can play H.264, Playwright's headless shell cannot.

**Preview/program on the Regie page:** with "Szenenwechsel bestätigen" (default on, stored per device), clicking a scene only queues it. The queued scene is shown in a preview monitor (`/hud/?scene=<id>`) next to the live output, and goes on air with "Übernehmen" ("Verwerfen" drops it). With the switch off, a click switches immediately.

**Fixed OBS URL per scene:** `/hud/?scene=<id>` always shows that scene and ignores the scene chosen in the control panel, so every OBS scene can have its own browser source and scenes are switched in OBS. `/hud/?scene=live` shows only the in-game HUD and never a full-screen scene. The URLs are listed in the control panel under Einstellungen → OBS.

## Kill feed

With real CS2 data the game's own kill feed is used: run `cl_draw_only_deathnotices 1` in the observer client to hide the CS HUD except for the kill feed. The own kill feed (`HudConfig.visibility.killfeed`, off by default) is only needed when the CS HUD is hidden completely; the demo match always shows it (`GsiUpdate.demo`).

## HUD configuration ("panel")

`HudConfig`: trivia, side boxes (title/subtitle/logo), player and match preview, swap teams, radar size, visibility of individual elements, team logo as avatar. Changes reach all HUDs immediately via Socket.io. HUD actions (`radarBigger`, `radarSmaller`, `toggleRadarView`, `toggleHud`) are transient and come from shortcuts or buttons.

## Theme editor

`Theme.colors` → CSS variables `--color-<key>` (`primary`, `panel`, `panel-strong`, `ct`, `t`, `money`, `bomb`, `defuse`, `border`, `text`, `text-muted`), plus `--radius`, `--hud-font`, sponsors (rotation, interval; each logo can be replaced, renamed and reordered), the brand logo in the top right corner (own toggle, optional grayscale) and the tournament logo. On the first start the default sponsors and the TacAM logo are copied into the uploads (`apps/server/src/defaultMedia.ts`), so they are regular entries that can be replaced or removed; removed defaults do not come back. The preview in the editor receives unsaved changes via `postMessage` (`tacam:theme-preview`, same origin only); OBS only sees saved themes.

## Production control from a second device

Settings → enable LAN access + PIN, restart the app. The control panel shows the LAN URLs. Enter the PIN once on the other device (cookie valid for 30 days). A HUD on another PC (e.g. the OBS machine) gets `?token=<token>` appended to its URL.

## Demo match

`apps/server/src/demo.ts` simulates a complete match on de_mirage (buying, movement, kills, bomb, defuse, halftime, game over) as real GSI payloads. *Demo-Daten anlegen* creates matching teams, players and a BO3. Real GSI data stops the demo automatically.

## Known limitations

- No kill feed details (flash/wallbang/no-scope) and no utility damage: not in CS2 GSI.
- No player cameras (WebRTC) and no "bring your own HUD" as in JTs-Hud.
- No spectator binds tool (telnet settings are prepared).
- `react-router-dom` 6 has two moderate advisories (backslash redirect in `<Link>`, SSR hydration). Not exploitable in the panel (fixed routes only, no SSR); fixed only in v7.
