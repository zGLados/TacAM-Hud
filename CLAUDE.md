# CLAUDE.md

CS2-Broadcast-HUD + Manager (TacAM-Design). Monorepo mit npm-Workspaces, TypeScript überall. Nutzer kommuniziert auf Deutsch; UI-Texte im Control-Panel deutsch, im HUD (Broadcast) englisch.

## Struktur

- `packages/shared` – Domain-Typen, `StatsTracker`, `inferKills`, Format-Helfer. Wird nach `dist/` gebaut; **nach Änderungen `npm run build -w @tacam/shared`**, sonst sehen Server/Apps alte Typen.
- `apps/server` – Express 4 + Socket.io; `app.ts` (Server-Fabrik), `live.ts` (GSI-Pipeline, Teamzuordnung, Szenen-Automatik), `api.ts` (REST + zod), `store.ts` (JSON-DB), `auth.ts` (LAN-PIN), `demo.ts` (simuliertes Match), `gsiInstall.ts`.
- `apps/hud` – React-Overlay; Zustand in `state/store.ts` (useSyncExternalStore), Komponenten in `components/`, Szenen in `scenes/`, CSS pro Komponente in `styles/`.
- `apps/control` – React-Control-Panel (react-router 6), Seiten in `pages/`, Bausteine in `components/ui.tsx`.
- `apps/desktop` – Electron-Main (`src/main.ts`), per esbuild zu CJS gebündelt.
- Doku: `README.md`, `docs/*.md`. **Offene Punkte und Übergabe-Stand: `docs/STATUS.md` zuerst lesen.**

## Befehle

`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · Testserver: `TACAM_DATA_DIR=./.data HUD_PORT=13490 GSI_PORT=23490 npx tsx apps/server/src/main.ts`

## Konventionen

- Node 18 im Dev-Setup: keine Pakete einführen, die Node ≥ 20 brauchen (Ausnahme Electron, Desktop braucht Node ≥ 22.12).
- HUD-CSS: BEM in kebab-case, `data-side`/`data-align`/`data-state`, Zustände `is-*`; keine IDs; Farben nur über `--color-*`-Variablen (siehe `docs/hud-styling.md`). Neue Elemente bekommen eine eigene Datei in `styles/` + Import in `styles/index.css`.
- Theme-Farben = `THEME_COLOR_KEYS` in `shared/types.ts`; HUD setzt `--color-<key>`. Neue Keys auch im Control-Panel (`ThemePage` Labels) ergänzen.
- Server-Eingaben immer per zod-Schema in `api.ts` validieren; Store-Änderungen laufen über `store.insert/update/setDoc`, die Broadcasts passieren automatisch (`store.on('change')`).
- csgogsi auf MR12/MR3 stellen (`regulationMR = 12`), Default ist MR15.
- `useSyncExternalStore`-Selektoren dürfen nur bestehende Referenzen zurückgeben (keine neuen Objekte), sonst Endlosschleife.
- Uploads werden als Dateiname gespeichert und als `/uploads/<name>` ausgeliefert.
- Kommentare sparsam, englisch im Code; erklären das Warum.

## Stolpersteine

- `.hud__layout` hat `perspective` → Containing Block für `position: fixed`; Wrapper müssen 100 % hoch sein.
- iframe-Vorschau im (dunklen) Control-Panel braucht `color-scheme: light`, sonst opaker weißer Hintergrund.
- `crypto.randomUUID`/`navigator.clipboard` fehlen bei LAN-Zugriff über http → Fallbacks verwenden.
- `import.meta.url` existiert im Electron-CJS-Bundle nicht → nur lazy verwenden (`paths.ts`).
- Kill-Events gibt es in CS2-GSI nicht; Killfeed/Stats basieren auf Zähler-Diffs (`inferKills`).

## Tests

Vitest in `packages/shared` und `apps/server`. Visuelle Regression des HUD: siehe `docs/development.md` (Fixtures + Playwright + Pixel-Diff).
