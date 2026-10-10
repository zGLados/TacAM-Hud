# TacAM HUD

CS2 broadcast HUD and HUD manager in the TacAM design. Inspired by [JTs-Hud](https://github.com/JohnTimmermann/JTs-Hud), but built from scratch and extended with live statistics, broadcast scenes, web-based production control and a theme editor.

| Area | What it does |
| --- | --- |
| **HUD** (OBS browser source) | Match bar, team panels, spectated player, radar (10 maps incl. the updated Cache), kill feed, bomb/defuse timers, utility/money, map series, trivia, player/match preview, sponsors |
| **New: stats** | ADR, KAST (incl. trades), HS %, KPR, opening kills/deaths, clutches, multi-kills, HLTV 1.0 rating, round history, economy (buy classification) |
| **New: scenes** | Starting soon (countdown), BRB, technical pause, halftime, map veto, scoreboard, match end with MVP, switched automatically or by click |
| **New: web control** | Control panel in the browser, also on a tablet or second PC (LAN with PIN) |
| **New: theme editor** | Colors, corner radius, font, sponsors, tournament logo, with live preview |
| **Manager** | Players (incl. CSV import and creating them from the live game), teams, matches with veto editor, automatic map results, GSI installation, demo match |

## Quick start

Requires Node.js ≥ 18.19 (≥ 22.12 for the desktop app, see below).

```bash
npm install
npm run build        # shared → hud → control → server
npm start            # starts the server on http://localhost:1349
```

- Control panel: <http://localhost:1349/control/>
- HUD for OBS: <http://localhost:1349/hud/> (browser source 1920×1080, leave "Custom CSS" empty)
- Testing without CS2: control panel → **Live** → *Demo-Daten anlegen* → *Demo-Match starten*

### Connecting CS2

1. Control panel → **Einstellungen** → *GSI-Config installieren* (the Steam folder is detected automatically, otherwise enter it).
2. Restart CS2 and join a match as spectator/GOTV.
3. In the **Live** tab, create unknown players with one click and assign their teams.

### Desktop app (Electron)

```bash
npm run desktop      # builds everything and starts the app
npm run dist         # installers (Windows NSIS/portable, Linux AppImage, macOS dmg)
```

The app runs the server internally, opens the control panel and registers global keyboard shortcuts. Electron 43 needs **Node ≥ 22.12** to install and build; server, HUD and control panel also run on Node 18.

Publishing a GitHub release with a tag like `v1.2.3` builds the Windows installer automatically and attaches it to the release (`.github/workflows/release.yml`).

### Keyboard shortcuts (desktop app)

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
