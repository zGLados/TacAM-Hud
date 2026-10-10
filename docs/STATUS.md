# Project status & open tasks

Everything listed here is **not done yet**.

## To evaluate: ideas from zGLados/wartescreen

No full integration (separate server, duplicates the scenes). Worth adopting:

1. A fixed OBS URL per scene, e.g. `/hud/?scene=brb` (one browser source per OBS scene).
2. FACEIT import (teams, rosters, veto by match ID).
3. Background videos for starting soon / BRB.
4. "Upcoming matches" and "player to watch" scenes based on player profiles + stats.
5. Veto animation (bans/picks revealed one after another).

## Release workflow

`.github/workflows/release.yml` exists but has **not run yet**. Check the first real release (GitHub Actions log, installer attached, installer starts).

## Environment / dependencies

- The system Node is 18.19. Server, HUD and control panel run on it.
- The desktop app uses Electron 43.7.9 (security fixes) → **Node ≥ 22.12 required** to install/build. Under Node 18 the Electron binary is missing. App start was so far only tested with Electron 33.
- `react-router-dom` 6.30.6: two moderate advisories (backslash redirect in `<Link>`, SSR hydration), not exploitable here; fixed only in v7 (breaking change).
- Changing shared types → `npm run build -w @tacam/shared` before server/HUD.
