# CLAUDE.md

CS2 broadcast HUD + manager (TacAM design). npm workspaces monorepo, TypeScript everywhere. The user communicates in German; all UI texts (control panel, desktop app, API errors, HUD) are English.

## Structure

- `packages/shared`: domain types, `StatsTracker`, `inferKills`, format helpers. Built to `dist/`; **after changes run `npm run build -w @tacam/shared`**, otherwise server/apps see stale types.
- `apps/server`: Express 4 + Socket.io; `app.ts` (server factory), `live.ts` (GSI pipeline, team assignment, scene automation), `api.ts` (REST + zod), `store.ts` (JSON DB), `auth.ts` (LAN PIN), `demo.ts` (simulated match), `gsiInstall.ts`.
- `apps/hud`: React overlay; state in `state/store.ts` (useSyncExternalStore), components in `components/`, scenes in `scenes/`, one CSS file per component in `styles/`.
- `apps/control`: React control panel (react-router 6), pages in `pages/`, building blocks in `components/ui.tsx`.
- `apps/desktop`: Electron main (`src/main.ts`), bundled to CJS with esbuild.
- `.github/workflows/release.yml`: builds the Windows installer when a GitHub release is published.
- Docs: `README.md`, `docs/*.md`. **Read `docs/STATUS.md` first for open tasks and the hand-over state.**

## Commands

`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · test server: `TACAM_DATA_DIR=./.data HUD_PORT=13490 GSI_PORT=23490 npx tsx apps/server/src/main.ts`

## Conventions

- **Documentation and code comments are English.** Comments are sparse and explain the why. UI texts are English as well (control panel, desktop app, API error messages, HUD).
- Node 18 in the dev setup: do not add packages that need Node ≥ 20 (exception: Electron, the desktop app needs Node ≥ 22.12).
- HUD CSS: BEM in kebab-case, `data-side`/`data-align`/`data-state`, states `is-*`; no IDs; colors only via `--color-*` variables (see `docs/hud-styling.md`). New elements get their own file in `styles/` + an import in `styles/index.css`.
- Theme colors = `THEME_COLOR_KEYS` in `shared/types.ts`; the HUD sets `--color-<key>`. Add new keys to the control panel as well (`ThemePage` labels).
- Always validate server input with a zod schema in `api.ts`; store changes go through `store.insert/update/setDoc`, broadcasts happen automatically (`store.on('change')`).
- Set csgogsi to MR12/MR3 (`regulationMR = 12`), the default is MR15.
- `useSyncExternalStore` selectors may only return existing references (no new objects), otherwise they loop forever.
- Uploads are stored as file names and served as `/uploads/<name>`.

## Pitfalls

- `.hud__layout` has `perspective` → containing block for `position: fixed`; wrappers must be 100 % high.
- The iframe preview in the (dark) control panel needs `color-scheme: light`, otherwise it gets an opaque white background.
- `crypto.randomUUID`/`navigator.clipboard` are missing for LAN access over http → use fallbacks.
- `import.meta.url` does not exist in the Electron CJS bundle → only use it lazily (`paths.ts`).
- CS2 GSI has no kill events; kill feed and stats are based on counter diffs (`inferKills`).

## Tests

Vitest in `packages/shared` and `apps/server`. Visual regression of the HUD: see `docs/development.md` (fixtures + Playwright + pixel diff).
