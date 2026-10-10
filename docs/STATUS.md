# Project status

Hand-over state for the next session. Latest release: **v0.1.16** (Start CS2 via HLAE, HLAE install/update from TacAM).

## Open tasks

### Next session (camera control, owner feedback 2026-10-10)

- **Starting CS2 via HLAE works** on the owner's PC (v0.1.16, launch mode HLAE).
- **To discuss: how the owner can see that CS2 really runs via HLAE.** Ideas: Diagnose already reads the cs2.exe command line (shows `-afxFixNetCon`); add a clear "Started via HLAE / Workshop Tools / normal" indicator in the CS2 console tab and/or the Live tab, e.g. from the command line or by querying an HLAE command (`mirv_…`) over the console.
- **Camera positions do not work yet** (test buttons `spec_goto` / `spec_lerpto` etc. in Integrations → CS2 console). Next: get the console output for each test button from the owner, check which commands CS2 accepts as a spectator, and switch to HLAE's own camera commands (`mirv_campath`, `mirv_input`) if `spec_goto`/`spec_lerpto` are not available.
- Not released yet: HLAE in its own, always visible settings card (commit 4e86ed4) – the owner did not find the install because it only showed with launch mode HLAE.

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

- `.github/workflows/release.yml` builds the Windows installer for every published release (verified v0.1.0–v0.1.16).
- Since v0.1.4 the release also carries `latest.yml` + `.blockmap`; the installed app offers updates itself. The updates 0.1.4 → 0.1.5 → 0.1.6 → 0.1.7 were verified on Windows (prompt, silent install, restart, data in `%APPDATA%\TacAM HUD` kept).

## Environment / dependencies

- Node ≥ 22.12 and npm ≥ 11 (see `docs/development.md`). On the dev machine the system Node is 18; Node 22 is installed user-locally in `~/.local/node22`.
- Changing shared types → `npm run build -w @tacam/shared` before server/HUD.

## Known audit findings (accepted)

`npm audit` reports 8 moderate findings, all from `sprintf-js` inside electron-builder's download chain (`@electron/get` → `global-agent` → `roarr`). It only runs while building the installer, never in the app or server; the suggested "fix" is a downgrade of electron-builder. Check again when electron-builder updates its dependencies.
