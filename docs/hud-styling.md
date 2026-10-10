# HUD styling

The HUD keeps the values and layout of the TacAM skin, but with its own descriptive structure instead of the copied skin classes (`teambox`, `player_data`, `round-thingy`, `#encapsulator` …).

## Naming scheme

- **BEM in kebab-case**: block `player-card`, element `player-card__health-bar`, modifier `phase-banner--warmup`.
- **Side/alignment as data attributes**: `data-side="CT|T"`, `data-align="left|right"`; the radar also uses `data-type` / `data-state`, the economy box `data-buy`.
- **States as `is-*` / `has-*`**: `is-visible`, `is-hidden`, `is-dead`, `is-focused`, `is-current`, `is-won`, `has-bomb`.
- **No IDs** for styling.
- **Theme variables**: `--color-<key>` (see docs/features.md), `--radius`, `--hud-font`.

## Files (`apps/hud/src/styles/`)

| File | Blocks | Component |
| --- | --- | --- |
| `base.css` | fonts, `:root` variables, `hud`, `hud__layout` | `App.tsx`, `Layout.tsx` |
| `match-bar.css` | `match-bar`, `bomb-timer`, `bomb-action`, `round-win-banner`, `series-bar` | `MatchBar.tsx` |
| `team-panel.css` | `team-panel`, `player-card`, `equipment-icon--*` | `TeamPanel.tsx` |
| `focus-player.css` | `focus-player` (spectated player) | `FocusPlayer.tsx` |
| `side-column.css` | `side-column`, `utility-box`, `info-box`, `money-box`, `economy-box`, `buy-badge` | `SideColumn.tsx` |
| `radar.css` | `radar-box`, `map-strip`, `radar`, `radar__player/grenade/bomb` | `RadarBox.tsx`, `radar/Radar.tsx` |
| `kill-feed.css` | `kill-feed` | `KillFeed.tsx` |
| `round-history.css` | `round-history` | `RoundHistory.tsx` |
| `map-series.css` | `map-series` | `MapSeries.tsx` |
| `overlays.css` | `center-stack`, `trivia`, `phase-banner`, `player-spotlight`, `match-teaser` | `Overlays.tsx` |
| `sponsors.css` | `sponsors` | `Sponsors.tsx` |
| `scenes.css` | `scene`, `score-header`, `stats-table(s)`, `veto-list`, `veto-card`, `mvp-card` | `scenes/Scenes.tsx` |

`index.css` imports everything in this order. Radar sprites are PNG files in `assets/radar-sprites/` (in the skin they were Base64 inside the CSS).

## Intentional differences from the skin

- The kill feed sits at `top: 155px` instead of `93px` (it overlapped the sponsors).
- The radar starts directly below the map strip: `Radar.tsx` sets `margin-top` per map from the transparent padding of each radar image (`RADAR_CONTENT_TOP` in `radar/maps.ts`) instead of the skin's fixed 35 px.
- The economy box sits next to the money box (there is no room in the column above it).
- Removed because they had no effect or were unused in the skin: scout prediction bar, camera container, `round-thingy`, `.no-bo`, zeus/secondary weapon rules.
- Trivia and player spotlight are stacked in one center column (`.center-stack`) instead of overlapping; alone they keep the skin's positions (130 px / 220 px).
- The match teaser sits next to the focus player (bottom, left of center) instead of on top of the right side column.

## Checking changes

Run the visual regression before and after CSS changes (see docs/development.md). Target: 0 differing pixels, except for intended changes.
