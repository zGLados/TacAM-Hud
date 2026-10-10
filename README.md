# TacAM HUD

CS2 broadcast HUD and HUD manager in the TacAM design. Inspired by [JTs-Hud](https://github.com/JohnTimmermann/JTs-Hud), but built from scratch and extended with live statistics, broadcast scenes, web-based production control and a theme editor.

| Area | What it does |
| --- | --- |
| **HUD** (OBS browser source) | Match bar, team panels, spectated player, radar (10 maps incl. the updated Cache), kill feed, bomb/defuse timers, utility/money, map series, trivia, player/match preview, sponsors; scoreboard, economy graph and player comparison overlays; wingman; teams can keep their side after halftime |
| **New: stats** | ADR, KAST (incl. trades), HS %, KPR, opening kills/deaths, clutches, multi-kills, HLTV 1.0 rating, round history, economy (buy classification) |
| **New: scenes** | Starting soon (optional countdown), BRB, technical pause, halftime, map veto, scoreboard, match end with MVP, upcoming matches, player to watch; background videos; switched automatically, by click or via a fixed OBS URL per scene |
| **New: web control** | Control panel in the browser, also on a tablet or second PC (LAN with PIN); Stream Deck / Companion URLs and configurable shortcuts; OBS scenes follow the TacAM scene (OBS WebSocket); signals: game events trigger overlays, Companion buttons, webhooks or OBS |
| **New: theme editor** | Colors, corner radius, font, sponsors, tournament logo, with live preview |
| **New: HUD import** | Import HUDs in the LHM / JTs-Hud format (zip with `hud.json`) and use them as their own OBS source, with their settings panel |
| **Manager** | Players and teams (CSV import, quick setup of both teams from the live game), matches with veto editor and captain veto links, automatic map results, GSI installation, demo match |

## Screenshots

**In-game HUD** during a round (kill feed, radar, team panels, focus player with live stats):

![In-game HUD during a round](docs/images/hud-live.webp)

**Freezetime**: round history, map series, utility, team money and the economy box with buy classification:

![HUD during freezetime](docs/images/hud-freezetime.webp)

**Broadcast scenes** (switched from the control panel, automatically, or via a fixed OBS URL per scene):

| Halftime | Match end with MVP |
| --- | --- |
| ![Halftime scene](docs/images/scene-halftime.webp) | ![Match end scene](docs/images/scene-matchEnd.webp) |
| **Starting soon** (optional countdown) | **Map veto** |
| ![Starting soon scene](docs/images/scene-starting.webp) | ![Map veto scene](docs/images/scene-veto.webp) |
| **Upcoming matches** | **Player to watch** |
| ![Upcoming matches scene](docs/images/scene-upcoming.webp) | ![Player to watch scene](docs/images/scene-playerToWatch.webp) |

**Overlays** over the live HUD, one at a time (Director → Overlays, Stream Deck, shortcut or signal):

| Scoreboard | Economy graph |
| --- | --- |
| ![Scoreboard overlay](docs/images/overlay-scoreboard.webp) | ![Economy graph overlay](docs/images/overlay-economy.webp) |
| **Player comparison** | |
| ![Player comparison overlay](docs/images/overlay-comparison.webp) | |

**Control panel** (runs in the browser, also on a second device):

| Live | Director |
| --- | --- |
| ![Control panel: live](docs/images/control-live.webp) | ![Control panel: director](docs/images/control-director.webp) |
| **Statistics** | **Theme editor with live preview** |
| ![Control panel: statistics](docs/images/control-stats.webp) | ![Control panel: theme editor](docs/images/control-theme.webp) |
| **Integrations: signals** (game events → overlays, Companion, OBS) | **Captain veto** on the captain's phone |
| ![Control panel: integrations with signals](docs/images/control-integrations.webp) | <img src="docs/images/veto-phone.webp" alt="Captain veto page on a phone" width="260"> |

Screenshots are taken from the built-in demo match; the HUD is transparent and shown on a gray background here.

## Quick start

Requires Node.js ≥ 22.12 and npm ≥ 11 (`npm install -g npm@11`; the npm 10 bundled with Node 22 fails to install the dependencies).

```bash
npm install
npm run build        # shared → hud → control → server
npm start            # starts the server on http://localhost:1349
```

- Control panel: <http://localhost:1349/control/>
- HUD for OBS: <http://localhost:1349/hud/> (browser source 1920×1080, leave "Custom CSS" empty)
- Testing without CS2: control panel → **Live** → *Create demo data* → *Start demo match*

### Connecting CS2

1. Control panel → **Settings** → *Install GSI config* (the Steam folder is detected automatically, otherwise enter it).
2. Restart CS2 and join a match as spectator/GOTV.
3. In the **Live** tab, create unknown players with one click and assign their teams.

### Desktop app (Electron)

```bash
npm run desktop      # builds everything and starts the app
npm run dist         # installers (Windows NSIS/portable, Linux AppImage, macOS dmg)
```

The app runs the server internally, opens the control panel and registers global keyboard shortcuts.

Publishing a GitHub release with a tag like `v1.2.3` builds the Windows installer automatically and attaches it to the release (`.github/workflows/release.yml`).

The installed app checks GitHub for a newer release on startup (and via *TacAM HUD → Check for updates*) and offers to download and install it. Teams, players, matches, uploads and settings are kept, because they live in the user data folder, not in the program folder.

### Keyboard shortcuts (desktop app)

Defaults below. Every action (scenes, overlays, HUD elements, team swaps) can get its own global shortcut under **Integrations → Keyboard shortcuts**; the same actions are available as URLs for Stream Deck / Bitfocus Companion (**Integrations → Stream Deck / Companion**).

| Shortcut | Action |
| --- | --- |
| `Alt+V` / `Alt+B` | Radar bigger / smaller |
| `Alt+N` | Toggle enlarged radar |
| `Alt+O` | Show/hide the HUD |
| `Alt+F` | Reload all HUDs |
| `Alt+H` | HUD overlay window (while the app window is focused) |

## Development

```bash
npm run dev          # server (tsx watch) + HUD (Vite :3500) + control (Vite :3600)
npm test             # Vitest: stats engine + server API
npm run typecheck
```

Further reading:

- [docs/architecture.md](docs/architecture.md): structure, data flow, team assignment
- [docs/features.md](docs/features.md): stats calculation, scenes, theme, LAN access
- [docs/api.md](docs/api.md): REST and Socket.io interface
- [docs/hud-styling.md](docs/hud-styling.md): naming scheme (BEM) and CSS structure of the HUD
- [docs/development.md](docs/development.md): workflow, tests, visual regression, releases
- [docs/STATUS.md](docs/STATUS.md): current state and open tasks
- [CLAUDE.md](CLAUDE.md): notes for AI assistants

## Data

Everything is stored locally: standalone in `~/.tacam-hud/` (override with `TACAM_DATA_DIR`), in the desktop app in Electron's `userData` folder (`db.json` + `uploads/`).

## License & credits

GPL-3.0-only. Design: [TacAM-Hud-Skin](https://github.com/zGLados/TacAM-Hud-Skin). Weapon/status icons and component structure based on [lexogrine/cs2-react-hud](https://github.com/lexogrine/cs2-react-hud) (MIT), GSI parsing with [csgogsi](https://github.com/lexogrine/csgogsi) (MIT). Cache radar and map banners from [JTs-Hud/OpenHud](https://github.com/JohnTimmermann/JTs-Hud) (GPL-3.0). Details: [THIRD_PARTY.md](THIRD_PARTY.md).
