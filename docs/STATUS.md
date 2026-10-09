# Projektstand & offene Punkte

Stand der Übergabe (Oktober 2026). Alles hier Gelistete ist **noch nicht erledigt**.

## Nächste Aufgaben (vom Projektinhaber festgelegt)

1. **Release-Build der Windows-Installer-.exe automatisieren:** GitHub-Actions-Workflow
   (z. B. `.github/workflows/release.yml`), der bei einem Release bzw. Tag `v*` auf
   `windows-latest` mit Node 22 `npm ci` und `npm run dist` ausführt und die
   NSIS-Installer-.exe (`apps/desktop/release/*.exe`) an das GitHub-Release hängt.
   Version in `apps/desktop/package.json` mit dem Tag abgleichen.
2. **Dokumentation und Code-Kommentare komplett auf Englisch:** `README.md`,
   `CLAUDE.md`, `THIRD_PARTY.md`, `docs/*.md` (inkl. dieser Datei) übersetzen und alle
   deutschen Kommentare im Code umstellen. Die Oberfläche des Control-Panels und die
   Fehlermeldungen der API bleiben vorerst deutsch, außer es wird anders entschieden.
   Danach in `CLAUDE.md` als Konvention festhalten: Doku und Kommentare auf Englisch.

## In Arbeit: logische CSS-/HTML-Namen im HUD (Aufgabe #7)

Der Umbau auf BEM-Namen (`match-bar__team`, `player-card`, `data-side`, `is-*`)
und eine CSS-Datei pro Komponente (`apps/hud/src/styles/`) ist umgesetzt.
Typecheck und Build sind grün. **Noch nicht durchgeführt ist der visuelle
Vergleich** gegen die Referenz-Screenshots von vor dem Umbau:

1. Server mit Testdaten starten:
   `cd apps/server && TACAM_DATA_DIR=../../.data HUD_PORT=13490 GSI_PORT=23490 npx tsx src/main.ts`
2. `.ref/pw/regress.cjs` zweimal ausführen (der erste Lauf wärmt die Stats auf)
   und mit `.ref/diff.py .ref/shots_before .ref/shots_after` vergleichen.
   Erwartet: 0 abweichende Pixel, außer bei bewusst geänderten Stellen.
   Hinweis: `.ref/` ist lokal und nicht im Repo. Ohne diesen Ordner Fixtures
   neu aufzeichnen (siehe docs/development.md).
3. Abweichungen in den neuen CSS-Dateien korrigieren.

## Bekannte Layout-Überlappungen aus dem Original-Skin

- Match-Vorschau (`.match-teaser`, `top: 375px`) liegt über der rechten Seitenspalte.
- Spieler-Vorschau (`.player-spotlight`) überdeckt die Trivia-Box.

Erst nach dem Regressionsvergleich bewusst neu positionieren.

## Prüfen: Ideen aus zGLados/wartescreen (Aufgabe #8)

Kein kompletter Einbau (eigener Server, doppelt die Szenen). Lohnend wären:
1. Feste OBS-URL pro Szene, z. B. `/hud/?scene=brb` (je OBS-Szene eine Browserquelle).
2. FACEIT-Import (Teams, Roster, Veto per Match-ID).
3. Hintergrundvideos für Starting Soon / BRB.
4. Szenen „Kommende Matches“ und „Player to watch“ aus Spielerprofilen + Stats.
5. Veto-Animation (Bans/Picks nacheinander).

## Umgebung / Abhängigkeiten

- System-Node ist 18.19. Server, HUD und Control-Panel laufen damit.
- Desktop-App nutzt Electron 43.7.9 (Sicherheits-Fixes) → **Node ≥ 22.12 nötig**
  zum Installieren/Bauen. Unter Node 18 fehlt das Electron-Binary.
  Getestet wurde der Start bisher nur mit Electron 33.
- `react-router-dom` 6.30.6: zwei mittlere Advisories (Backslash-Redirect in
  `<Link>`, SSR-Hydration) – hier nicht ausnutzbar, Fix erst in v7 (Breaking Change).
- Gemeinsame Typen ändern → `npm run build -w @tacam/shared` vor Server/HUD.
