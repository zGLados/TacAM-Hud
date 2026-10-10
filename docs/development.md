# Development

## Commands

| Command | Effect |
| --- | --- |
| `npm run dev` | Server (`tsx watch`, :1349) + HUD Vite (:3500/hud/) + control Vite (:3600/control/); Vite proxies `/api`, `/uploads`, `/socket.io` |
| `npm run build` | `shared` → `hud` → `control` → `server` |
| `npm test` | Vitest (`packages/shared` stats, `apps/server` API) |
| `npm run typecheck` | tsc in all workspaces |
| `npm start` | Start the built server |
| `npm run desktop` / `npm run dist` | Start Electron / build installers |

`packages/shared` is built to `dist/` and the other packages import it from there, so always run `npm run build -w @tacam/shared` after changing `shared`.

Isolated test server: `TACAM_DATA_DIR=./.data HUD_PORT=13490 GSI_PORT=23490 npx tsx apps/server/src/main.ts` (`.data/` is git-ignored).

## Conventions

- Documentation and code comments are written in English.
- All UI texts (control panel, desktop app, API error messages, HUD) are English.

## Versions

Requires **Node ≥ 22.12** and **npm ≥ 11** (`.nvmrc`, `engines`, `packageManager` in the root `package.json`). npm 10, which ships with Node 22, crashes while resolving Vitest's peer dependencies (`Cannot read properties of null (reading 'edgesOut')`); `npm install -g npm@11` fixes it. npm 11 only runs install scripts listed under `allowScripts` in the root `package.json` (esbuild, electron-winstaller); approve new ones with `npm install-scripts approve <pkg>`. Main versions: Vite 8, Vitest 5, React 18.3, React Router 7, Express 4, Electron 43.

## Tests

- `packages/shared/src/stats.test.ts`: kill inference, KAST/trades, clutches, ratings, backup restore/restart, buy classes.
- `apps/server/src/api.test.ts`: starts a real server on a random port with a temporary data folder (CRUD, validation, theme injection, GSI token).

## Visual regression (HUD)

Local only, not part of the repo (the helper scripts live in the git-ignored `.ref/`):

1. Start a test server with the demo and save three GSI states from `GET /api/live/raw` as JSON fixtures (freezetime, early and late live state of the same round).
2. Replay the fixtures by POSTing them to the GSI port (with the token from `db.json`) and take screenshots of the HUD, overlays and all scenes with Playwright (`playwright-core` + an installed headless shell).
3. Compare before/after pixel by pixel (PIL `ImageChops.difference`, threshold 24).

Note: `google-chrome --headless --screenshot` with `--virtual-time-budget` hangs with open socket connections and counts the window bar into the height; Playwright is more reliable.

## README screenshots

`docs/images/*.webp` are taken with Playwright from the demo match (HUD 1920×1080 on a gray background, control panel 1600×1000), then converted to WebP (quality 85). The capture scripts are local helpers in `.ref/pw/` (`readme_shots.cjs`, `readme_demo_shots.cjs`). Retake them after visible UI changes.

## Releases

Publishing a GitHub release (tag `vX.Y.Z`) runs `.github/workflows/release.yml` on `windows-latest` with Node 22 and npm 11: `npm ci`, typecheck, tests, build, then `electron-builder --win nsis`. The version is taken from the tag, and the installer `.exe` is attached to the release together with `latest.yml` and the `.blockmap`. The desktop app (`apps/desktop/src/updater.ts`, `electron-updater`) reads `latest.yml` from the newest GitHub release on startup and offers the update; it downloads only after confirmation and installs silently on restart. The data in `userData` is never touched by the installer. Draft and pre-releases are ignored, and the portable build does not update itself. The workflow can also be started manually for an existing tag (`workflow_dispatch`).

Checklist:

1. `npm run typecheck && npm test && npm run build`
2. Review the demo match in the HUD and all scenes
3. Create the GitHub release with tag `vX.Y.Z` and wait for the workflow
4. Download the installer from the release and test it briefly
