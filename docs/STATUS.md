# Project status

Hand-over state for the next session. Latest release: **v0.1.7** (LHM roadmap phase 1).

## Open tasks

- LHM roadmap ([lhm-roadmap.md](lhm-roadmap.md)): **phase 1 done** (#1–#7) and released in v0.1.7. Phases 2 and 3 are proposals, to be decided.
- LHM roadmap phase 2 **done** (#8–#12b): captain veto, Companion state URLs, OBS WebSocket, signals, quick setup + team CSV, MatchZy export. Not released yet. Phase 3 items are proposals.
- Still to confirm on Windows with v0.1.7: global shortcuts (defaults + re-registering after a change), Stream Deck trigger URLs (Elgato "Website" action in background mode), overlays and "keep team sides" in a real match, a real wingman game.

## Decided / not planned

- From zGLados/wartescreen: fixed OBS URL per scene, background videos, "upcoming matches" and "player to watch" are done. FACEIT import (tournaments rarely run on FACEIT) and a veto animation are not planned.

## Releases

- `.github/workflows/release.yml` builds the Windows installer for every published release (verified v0.1.0–v0.1.7).
- Since v0.1.4 the release also carries `latest.yml` + `.blockmap`; the installed app offers updates itself. The updates 0.1.4 → 0.1.5 → 0.1.6 → 0.1.7 were verified on Windows (prompt, silent install, restart, data in `%APPDATA%\TacAM HUD` kept).

## Environment / dependencies

- Node ≥ 22.12 and npm ≥ 11 (see `docs/development.md`). On the dev machine the system Node is 18; Node 22 is installed user-locally in `~/.local/node22`.
- Changing shared types → `npm run build -w @tacam/shared` before server/HUD.

## Known audit findings (accepted)

`npm audit` reports 8 moderate findings, all from `sprintf-js` inside electron-builder's download chain (`@electron/get` → `global-agent` → `roarr`). It only runs while building the installer, never in the app or server; the suggested "fix" is a downgrade of electron-builder. Check again when electron-builder updates its dependencies.
