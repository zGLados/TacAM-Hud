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

`docs/images/*.webp` are taken with Playwright from the demo match (HUD 1920×1080 on a gray background, control panel 1600×1000), then converted to WebP (quality 85). The capture scripts are local helpers in `.ref/pw/`: `readme_shots.cjs` (live HUD, starting soon, veto, control live/theme from recorded fixtures) and `readme_v2_shots.cjs` (runs the demo past halftime, ~12 min: freezetime, halftime, match end, the three overlays, stats, director, Integrations → Signals with example rules and the captain veto page at phone size; restores signals and the current match afterwards). `scene-upcoming`/`scene-playerToWatch` come from `new_scenes.cjs`; `control-camera` (`camera_check.cjs`, against a fake HLAE console), `control-huds` (`huds_check.cjs`, with the LHM default HUD imported) and `hud-win-probability` (`prediction_check.cjs`, cropped) from their test scripts. The project logo at the top of the README (`docs/images/tacam-logo.png`) is the TacAM logo, cropped from `apps/hud/public/defaults/brand-logo.png`; sponsor logos may appear in the screenshots. Retake them after visible UI changes.

## CI

`.github/workflows/ci.yml` runs typecheck, tests and build on every push to `main` and every pull request, on Linux and Windows (some behavior differs per platform, e.g. console hints). The README shows its status (badge *CI*) next to the status of the last release build (*Release build*).

## Versions and releases

**Version numbers** follow semantic versioning: a release with new features raises the minor version (`0.2.0` → `0.3.0`), a release with only fixes the patch version (`0.2.0` → `0.2.1`). `1.0.0` comes once TacAM has carried a real broadcast. Test builds are betas: `0.3.0-beta.1`, `-beta.2`, … before `0.3.0`.

**One version for everything:** the root `package.json` and every workspace carry the app version; internal dependencies use `*`. `npm run version:set -- 0.3.0` sets it everywhere (then `npm install` to update the lockfile). The control panel shows it in the sidebar and under Settings → App updates (`__APP_VERSION__`, `apps/control/vite.config.ts`).

**Changelog:** every user-visible change goes into `CHANGELOG.md` (newest version on top, sections Added / Changed / Fixed). The GitHub release notes are taken from it.

**Release build:** publishing a GitHub release runs `.github/workflows/release.yml` on `windows-latest` with Node 22 and npm 11: `npm ci`, a check that the tag (`vX.Y.Z` / `vX.Y.Z-beta.N`) matches `package.json` (otherwise it fails), typecheck, tests, build, then `electron-builder --win nsis` (`generateUpdatesFilesForAllChannels`). The installer `.exe`, the `.blockmap` and the update files `latest.yml` (+ `beta.yml` / `alpha.yml`) are attached to the release. The workflow can also be started manually for an existing tag (`workflow_dispatch`).

**Updates:** the desktop app (`apps/desktop/src/updater.ts`, `electron-updater`) checks GitHub on startup and offers the update; it downloads only after confirmation and installs silently on restart. The data in `userData` is never touched. Stable installs only see normal releases. With *Settings → App updates → Also offer beta versions* (`settings.betaUpdates` → `autoUpdater.allowPrerelease`) GitHub **pre-releases** are offered too – publish betas as pre-release (`gh release create v0.3.0-beta.1 --prerelease`). Drafts are ignored, and the portable build does not update itself.

### Code signing (SignPath Foundation)

The installer is signed by [SignPath Foundation](https://signpath.org) (free for open source). The README section *Code signing policy* is required by their [terms](https://signpath.org/terms); every release page must mention it too (link in the release notes). The signing steps in `release.yml` only run when the repository variable `SIGNPATH_ORGANIZATION_ID` is set – until then releases are built unsigned as before.

Flow in the release workflow: electron-builder builds the NSIS installer → `actions/upload-artifact` (zip with the `.exe`) → `SignPath/github-action-submit-signing-request@v3` (waits up to an hour for the manual approval in SignPath) → the signed `.exe` replaces the unsigned one, `Get-AuthenticodeSignature` must say *Valid* → `apps/desktop/scripts/refresh-update-info.mjs` rebuilds the `.blockmap` and the `sha512` / `size` in `latest.yml` / `beta.yml` (the signature changes the file; with the old hashes the in-app updater would reject the download) → upload to the release. Only the installer is signed; the app `.exe` inside it is not (SignPath cannot sign inside NSIS), which is fine for SmartScreen – it checks the downloaded file. Signing happens after electron-builder, so `app-update.yml` has no `publisherName` and electron-updater does not compare publishers; if signing ever moves into electron-builder with `publisherName`, a different certificate subject would break updates.

Setup after SignPath accepted the project:

1. GitHub and SignPath accounts of everyone involved use two-factor authentication.
2. In SignPath: project slug `TacAM-Hud`, link the trusted build system *GitHub.com* to it, signing policy `release-signing` with manual approval, artifact configuration `installer`:
   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <zip-file>
       <pe-file path="TacAM-HUD-Setup-*.exe" product-name="TacAM HUD" max-matches="1">
         <authenticode-sign />
       </pe-file>
     </zip-file>
   </artifact-configuration>
   ```
   (file metadata restrictions as SignPath asks for them: product name *TacAM HUD*, product version = the app version.)
3. A SignPath API token for a CI user with the *submitter* role.
4. GitHub → Settings → Secrets and variables → Actions: variable `SIGNPATH_ORGANIZATION_ID`, secret `SIGNPATH_API_TOKEN`. Other slugs only if they differ from the defaults (`SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`).
5. Next release: approve the signing request in SignPath while the workflow waits; check the installer's *Properties → Digital Signatures*.

SmartScreen still warns for the first downloads of a newly signed program – the reputation builds with downloads and then carries over to new versions signed with the same certificate (EV certificates no longer skip this either).

Checklist:

1. `CHANGELOG.md` updated, `npm run version:set -- X.Y.Z` + `npm install`, commit
2. `npm run typecheck && npm test && npm run build`
3. Review the demo match in the HUD and all scenes
4. Create the GitHub release with tag `vX.Y.Z` (beta: `--prerelease`), notes from the changelog plus a link to the code signing policy, and wait for the workflow (once signing is active: approve the request in SignPath)
5. Download the installer from the release and test it briefly
