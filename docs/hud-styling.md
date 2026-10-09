# HUD-Styling

Das HUD übernimmt Werte und Layout des TacAM-Skins, aber mit eigener, sprechender Struktur statt der kopierten Skin-Klassen (`teambox`, `player_data`, `round-thingy`, `#encapsulator` …).

## Namensschema

- **BEM in kebab-case**: Block `player-card`, Element `player-card__health-bar`, Modifier `phase-banner--warmup`.
- **Seite/Ausrichtung als Data-Attribut**: `data-side="CT|T"`, `data-align="left|right"`; Radar zusätzlich `data-type` / `data-state`, Economy `data-buy`.
- **Zustände als `is-*` / `has-*`**: `is-visible`, `is-hidden`, `is-dead`, `is-focused`, `is-current`, `is-won`, `has-bomb`.
- **Keine IDs** fürs Styling.
- **Theme-Variablen**: `--color-<key>` (siehe docs/features.md), `--radius`, `--hud-font`.

## Dateien (`apps/hud/src/styles/`)

| Datei | Blöcke | Komponente |
| --- | --- | --- |
| `base.css` | Fonts, `:root`-Variablen, `hud`, `hud__layout` | `App.tsx`, `Layout.tsx` |
| `match-bar.css` | `match-bar`, `bomb-timer`, `bomb-action`, `round-win-banner`, `series-bar` | `MatchBar.tsx` |
| `team-panel.css` | `team-panel`, `player-card`, `equipment-icon--*` | `TeamPanel.tsx` |
| `focus-player.css` | `focus-player` (beobachteter Spieler) | `FocusPlayer.tsx` |
| `side-column.css` | `side-column`, `utility-box`, `info-box`, `money-box`, `economy-box`, `buy-badge` | `SideColumn.tsx` |
| `radar.css` | `radar-box`, `map-strip`, `radar`, `radar__player/grenade/bomb` | `RadarBox.tsx`, `radar/Radar.tsx` |
| `kill-feed.css` | `kill-feed` | `KillFeed.tsx` |
| `round-history.css` | `round-history` | `RoundHistory.tsx` |
| `map-series.css` | `map-series` | `MapSeries.tsx` |
| `overlays.css` | `trivia`, `phase-banner`, `player-spotlight`, `match-teaser` | `Overlays.tsx` |
| `sponsors.css` | `sponsors` | `Sponsors.tsx` |
| `scenes.css` | `scene`, `score-header`, `stats-table(s)`, `veto-list`, `veto-card`, `mvp-card` | `scenes/Scenes.tsx` |

`index.css` importiert alles in dieser Reihenfolge. Radar-Sprites liegen als PNG in `assets/radar-sprites/` (im Skin waren sie Base64 in der CSS).

## Bewusste Abweichungen vom Skin

- Killfeed sitzt bei `top: 155px` statt `93px` (überlappte die Sponsoren).
- Economy-Box neben der Geldbox (in der Spalte darüber ist kein Platz).
- Entfernt, weil im Skin wirkungslos/ungenutzt: Scout-Prognosebalken, Kamera-Container, `round-thingy`, `.no-bo`, Zeus-/Secondary-Regeln.
- Bekannte Überlappungen aus dem Original-Layout (Match-Vorschau über der rechten Box-Spalte, Spieler-Vorschau über Trivia) sind noch offen.

## Änderungen prüfen

Vor/nach CSS-Umbauten die visuelle Regression laufen lassen (siehe docs/development.md) – Ziel: 0 abweichende Pixel, außer bei beabsichtigten Änderungen.
