# Screenshots and visual checks

Dev helpers for the README / website screenshots (`docs/images`, `website/images`) and for before/after comparisons of the HUD. Not part of the npm workspaces and not needed to build TacAM HUD.

## Setup (once per PC)

```bash
cd tools/screenshots
npm install
npx playwright-core install chromium-headless-shell   # or set CHROMIUM_PATH to an installed Chromium
pip install pillow                                     # for to-webp.py and diff.py
```

## Usage

Start a test server from the repo root (the scripts default to these ports and `.data`; override with `HUD_PORT`, `GSI_PORT`, `TACAM_DATA_DIR`):

```bash
TACAM_DATA_DIR=./.data HUD_PORT=13490 GSI_PORT=23490 npx tsx apps/server/src/main.ts
curl -X POST localhost:13490/api/demo/seed      # demo teams, players and match on a fresh data folder
```

| Script | Takes |
| --- | --- |
| `node shots-fixtures.cjs` | live HUD, freezetime, halftime / match end / veto / starting soon scenes, control Live / Director / Stats / Theme – from the recorded GSI states in `fixtures/` (fast, repeatable) |
| `node shots-demo.cjs` | runs the demo match past halftime (~12 min): freezetime, halftime, match end, the three overlays, Stats, Director, Integrations → Signals with example rules, captain veto on a phone; restores signals and the match afterwards |
| `node shots-scenes.cjs` | upcoming matches and player to watch (start the demo match first) |
| `node record-fixtures.cjs` | records new `fixtures/` from a running demo match (freezetime + early/late state of one round) |
| `python3 to-webp.py [name …]` | converts `out/*.png` to `docs/images/*.webp` (quality 85) and refreshes the copies in `website/images` |
| `python3 diff.py out-before out` | pixel diff per screenshot (threshold 24) – copy `out` to `out-before` before a change |

Screenshots land in `out/` (git-ignored). The camera, HUDs and win probability images (`control-camera`, `control-huds`, `hud-win-probability`) were taken by hand from their feature checks; retake them the same way when those pages change. After new website images: tell the owner which files in `website/images` to upload.
