# Project status

Hand-over state for the next session. Latest release: **v0.1.18** (player selection, free camera on demo load, camera fixes).

## Open tasks

### Camera control (owner tested 2026-10-11)

- **Works on the owner's PC (v0.1.17):** CS2 via HLAE, HLAE detection, HLAE free camera (`mirv_input camera`), camera path playback. Console test buttons now use HLAE commands (`spec_goto`/`spec_lerpto` are not needed).
- **Player selection, released in v0.1.18:** Camera page *Players* (one button per player → `spec_player "<name>"` + `spec_mode 1`, after leaving HLAE camera/path), *Previous/Next player*, Stream Deck actions *Spectate player on slot 1–0*. Tested against a fake console with the demo match. **Owner to test in CS2:** does a click switch to the right player in a demo / as GOTV spectator, also after a free camera or a path? Names starting with a digit cannot be targeted (CS2 limitation) → Next/Previous.
- **Fixed after the owner's test (v0.1.18):** jumping to a saved view tilted the camera sideways – `mirv_input angles` takes pitch yaw roll (HLAE's usage text says otherwise). Black screen after loading another demo: TacAM now ends HLAE camera/path when GSI reports a new map. If it stays black, the console command `mirv_input end; mirv_campath enabled 0` or *Back to game view* should help – owner to confirm.
- **Free camera on demo / map load (v0.1.18):** TacAM ends camera/path and enters `mirv_input camera` from the current game view (toggle on the Camera page, default on), plus a key overview. Owner's report "picture shrinks to a white dot after a disconnect" = HLAE FOV growing to 180° (Page Down / Numpad 1 or wheel seen as held) – Home resets it; entering the free camera fresh resets it too.
- **Proposed for v0.1.19 (waiting for the owner):** editable console command lists on the Camera page for "demo / map loaded" and "back to the main menu" (e.g. `cl_draw_only_deathnotices 1/0`, `engine_no_focus_sleep 0/60`). `ignoremsg` / `ignorerad` are toggles, so they cannot be set reliably on every load. Open question: CS2 kill feed or TacAM kill feed in the stream (both visible = duplicate).
- **Later: auto observer (#17)** on the same console bridge (switch to the player in the duel / with the bomb / last alive, with a minimum dwell time, manual takeover pauses it).
- Other ideas: Stream Deck / shortcut actions per saved view, signals → camera (e.g. round start → overview path).

- HUD import (LHM / JTs-Hud format) **done**, released in v0.1.10. Tested with the official LHM CS2 default HUD (lexogrine/cs2-react-hud, built locally): live data, teams, radar, match series, settings panel (trivia, side boxes). Still to test: other community HUDs and a JTs-Hud HUD package.
- LHM roadmap ([lhm-roadmap.md](lhm-roadmap.md)): **phase 1 done** (#1–#7) and released in v0.1.7.
- LHM roadmap phase 2 **done** (#8–#12b): captain veto, Companion state URLs, OBS WebSocket, signals, quick setup + team CSV, MatchZy export. Released in v0.1.8; v0.1.9 reorganized the control panel (Integrations page, grouped navigation, Director jump bar). Phase 3 items are proposals.
- Still to confirm on Windows with v0.1.7: global shortcuts (defaults + re-registering after a change), Stream Deck trigger URLs (Elgato "Website" action in background mode), overlays and "keep team sides" in a real match, a real wingman game.

- Phase 3: #15 win probability **done**, released in v0.1.11. Next candidate #14 tournaments; cameras, OBS replays and the auto observer only after tests with real hardware/CS2.

- **Background: camera paths in CS2.** Needs a console bridge to the observer client (`-netconport`). Plan: saved camera positions per map (`getpos` → `spec_goto`), smooth paths via `spec_lerpto` if CS2 still has it, else HLAE `mirv_campath` (insecure mode, observer PC only). Done so far: *Start CS2* with launch options (adds `-netconport`) and the console bridge with a test console (Integrations → CS2 console). Connection solved: on Windows CS2 needs `-tools -netconport 2020` (Workshop Tools; CS2 bug #3603), confirmed working. With `-tools` CS2 freezes as soon as another program has the focus (`engine_no_focus_sleep 0` does not help), so a HLAE launch mode was added (`-afxFixNetCon` = HLAE's fix for the netcon bug, no `-tools` needed; HLAE also has `mirv_campath`). HLAE can be installed/updated from TacAM (v0.1.16). Next: the owner tests HLAE mode, then which commands work as a GOTV spectator (test buttons for `getpos`, `spec_mode`, `spec_goto`, `spec_lerpto`, `spec_player`). The same bridge is the base for the auto observer (#17).

## Decided / not planned

- Not planned: bomb damage preview in the health bars (CS2 July 2026 bomb rework). CS2 computes it from damage data baked into the map and GSI does not send it (checked with a raw payload during a plant); an approximation would be wrong behind walls.
- From zGLados/wartescreen: fixed OBS URL per scene, background videos, "upcoming matches" and "player to watch" are done. FACEIT import (tournaments rarely run on FACEIT) and a veto animation are not planned.

## Releases

- `.github/workflows/release.yml` builds the Windows installer for every published release (verified v0.1.0–v0.1.18).
- Since v0.1.4 the release also carries `latest.yml` + `.blockmap`; the installed app offers updates itself. The updates 0.1.4 → 0.1.5 → 0.1.6 → 0.1.7 were verified on Windows (prompt, silent install, restart, data in `%APPDATA%\TacAM HUD` kept).

## Environment / dependencies

- Node ≥ 22.12 and npm ≥ 11 (see `docs/development.md`). On the dev machine the system Node is 18; Node 22 is installed user-locally in `~/.local/node22`.
- Changing shared types → `npm run build -w @tacam/shared` before server/HUD.

## Known audit findings (accepted)

`npm audit` reports 8 moderate findings, all from `sprintf-js` inside electron-builder's download chain (`@electron/get` → `global-agent` → `roarr`). It only runs while building the installer, never in the app or server; the suggested "fix" is a downgrade of electron-builder. Check again when electron-builder updates its dependencies.
