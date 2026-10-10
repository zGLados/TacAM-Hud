# Project status

Hand-over state for the next session. Latest release: **v0.1.6**, the Windows installer with in-app updater and the first build with Node 22, npm 11 and Vite 8.

## Open tasks

- **In progress: LHM roadmap phase 1** ([lhm-roadmap.md](lhm-roadmap.md)), order #1 → #6 → #7 → #2 → #3 → #4 → #5, one commit per feature, release at the end.
  - Done: #1 keep team sides after halftime, #6 trigger URLs for Stream Deck/Companion, #7 wingman / custom rounds per half, #2 scoreboard overlay, #3 economy graph, #4 player comparison.
  - Next: #5 keybinds editor (desktop shortcuts from settings; actions from `apps/server/src/actions.ts`).

## Decided / not planned

- From zGLados/wartescreen: fixed OBS URL per scene, background videos, "upcoming matches" and "player to watch" are done. FACEIT import (tournaments rarely run on FACEIT) and a veto animation are not planned.

## Releases

- `.github/workflows/release.yml` builds the Windows installer for every published release (verified v0.1.0–v0.1.6).
- Since v0.1.4 the release also carries `latest.yml` + `.blockmap`; the installed app offers updates itself. The updates 0.1.4 → 0.1.5 → 0.1.6 were verified on Windows (prompt, silent install, restart, data in `%APPDATA%\TacAM HUD` kept).

## Environment / dependencies

- Node ≥ 22.12 and npm ≥ 11 (see `docs/development.md`). On the dev machine the system Node is 18; Node 22 is installed user-locally in `~/.local/node22`.
- Changing shared types → `npm run build -w @tacam/shared` before server/HUD.

## Known audit findings (accepted)

`npm audit` reports 8 moderate findings, all from `sprintf-js` inside electron-builder's download chain (`@electron/get` → `global-agent` → `roarr`). It only runs while building the installer, never in the app or server; the suggested "fix" is a downgrade of electron-builder. Check again when electron-builder updates its dependencies.
