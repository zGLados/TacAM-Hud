# Entwicklung

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Server (`tsx watch`, :1349) + HUD-Vite (:3500/hud/) + Control-Vite (:3600/control/), Vite proxyt `/api`, `/uploads`, `/socket.io` |
| `npm run build` | `shared` → `hud` → `control` → `server` |
| `npm test` | Vitest (`packages/shared` Stats, `apps/server` API) |
| `npm run typecheck` | tsc in allen Workspaces |
| `npm start` | gebauten Server starten |
| `npm run desktop` / `npm run dist` | Electron starten / Installer bauen (Node ≥ 22.12) |

`packages/shared` wird nach `dist/` gebaut und von den anderen Paketen von dort importiert – nach Änderungen an `shared` immer `npm run build -w @tacam/shared`.

Für einen isolierten Testserver: `TACAM_DATA_DIR=./.data HUD_PORT=13490 GSI_PORT=23490 npx tsx apps/server/src/main.ts` (`.data/` ist ignoriert).

## Versionen

Abhängigkeiten sind auf Node-18-kompatible Versionen gepinnt (Vite 5.4, Vitest 2.1, Express 4, csgogsi 4.1, React 18.3). Ausnahme: Electron 43 (Sicherheitsfixes) braucht Node ≥ 22.12. Bei einem Node-Upgrade können die übrigen Pakete angehoben werden.

## Tests

- `packages/shared/src/stats.test.ts`: Kill-Inferenz, KAST/Trades, Clutches, Ratings, Backup-Restore/Restart, Buy-Klassen.
- `apps/server/src/api.test.ts`: startet einen echten Server auf Zufallsport mit temporärem Datenordner (CRUD, Validierung, Theme-Injection, GSI-Token).

## Visuelle Regression (HUD)

Lokal, nicht im Repo (Hilfsskripte lagen während der Entwicklung im ignorierten `.ref/`):

1. Testserver mit Demo starten, drei GSI-Zustände über `GET /api/live/raw` als JSON-Fixtures speichern (Freezetime, früher und später Live-Zustand derselben Runde).
2. Fixtures per POST an den GSI-Port (mit Token aus `db.json`) einspielen, mit Playwright (`playwright-core` + vorhandene Headless-Shell) Screenshots von HUD, Overlays und allen Szenen machen.
3. Vorher/Nachher pixelweise vergleichen (PIL `ImageChops.difference`, Schwelle 24).

Hinweis: `google-chrome --headless --screenshot` mit `--virtual-time-budget` hängt bei offenen Socket-Verbindungen und zählt die Fensterleiste zur Höhe – Playwright ist zuverlässiger.

## Release-Checkliste

1. `npm run typecheck && npm test && npm run build`
2. Demo-Match im HUD und alle Szenen sichten
3. `npm run dist` (Node ≥ 22.12), Installer kurz testen
4. Version in den `package.json` und CHANGELOG anheben
