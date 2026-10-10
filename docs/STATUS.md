# Project status & open tasks

Everything listed here is **not done yet**.

## Ideas from zGLados/wartescreen (decided)

Evaluated together with the project owner:

- Done: fixed OBS URL per scene (`/hud/?scene=<id>`), background videos, scenes "upcoming matches" and "player to watch".
- Not planned: FACEIT import (tournaments rarely run on FACEIT), veto animation.

## Release workflow

`.github/workflows/release.yml` works (v0.1.0–v0.1.3). From v0.1.4 on the release also carries `latest.yml` + `.blockmap` for the in-app updater. **Open:** verify an actual update end to end (install v0.1.4, publish v0.1.5, accept the update prompt, check that data in `%APPDATA%\TacAM HUD` survived).

## Environment / dependencies

- The system Node is 18.19. Server, HUD and control panel run on it.
- The desktop app uses Electron 43.7.9 (security fixes) → **Node ≥ 22.12 required** to install/build. Under Node 18 the Electron binary is missing. App start was so far only tested with Electron 33.
- `react-router-dom` 6.30.6: two moderate advisories (backslash redirect in `<Link>`, SSR hydration), not exploitable here; fixed only in v7 (breaking change).
- Changing shared types → `npm run build -w @tacam/shared` before server/HUD.
