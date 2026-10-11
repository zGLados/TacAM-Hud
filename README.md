<div align="center">

<img src="docs/images/tacam-logo.png" alt="TacAM logo" width="150">

# TacAM HUD

**CS2 broadcast HUD and production manager in the TacAM design**

Live HUD with statistics, broadcast scenes and overlays · web-based director · camera control via HLAE · Stream Deck, OBS and Companion integration

[![CI](https://github.com/zGLados/TacAM-Hud/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/zGLados/TacAM-Hud/actions/workflows/ci.yml)
[![Release build](https://github.com/zGLados/TacAM-Hud/actions/workflows/release.yml/badge.svg)](https://github.com/zGLados/TacAM-Hud/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/zGLados/TacAM-Hud?label=release&color=c13a3a)](https://github.com/zGLados/TacAM-Hud/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/zGLados/TacAM-Hud/total?color=1a3a5c)](https://github.com/zGLados/TacAM-Hud/releases)
[![License](https://img.shields.io/github/license/zGLados/TacAM-Hud?color=555)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20·%20Linux%20(server)-555)

[**Download**](https://github.com/zGLados/TacAM-Hud/releases/latest) · [Website](https://hud.tac.am) · [Report a bug](https://github.com/zGLados/TacAM-Hud/issues/new/choose) · [Get involved](#get-involved) · [Code signing policy](#code-signing-policy) · [Features](#features) · [Screenshots](#screenshots) · [Getting started](#getting-started) · [Camera control](#camera-control-hlae) · [Docs](#documentation)

<img src="docs/images/hud-live.webp" alt="TacAM HUD during a round" width="100%">

</div>

Inspired by [JTs-Hud](https://github.com/JohnTimmermann/JTs-Hud) and [LHM.gg](https://lhm.gg), built from scratch: one Windows app (or a Node server) that runs the HUD for OBS, the control panel in the browser and everything around a CS2 broadcast.

## Features

| | |
| --- | --- |
| 🎯 **Broadcast HUD** | Match bar, team panels, spectated player, radar (10 maps incl. the updated Cache), kill feed, bomb/defuse timers, utility and money, map series, round history, sponsors – as a transparent 1920×1080 OBS browser source |
| 📊 **Live statistics** | ADR, KAST (incl. trades), HS %, KPR, opening kills, clutches, multi-kills, HLTV 1.0 rating, round history and economy with buy classification |
| 🧩 **Overlays** | Scoreboard, economy graph and player comparison over the live HUD; round win probability bar (estimate); teams can keep their HUD side after halftime; wingman / custom rounds per half |
| 🎬 **Scenes** | Starting soon (optional countdown), BRB, technical pause, halftime, map veto, scoreboard, match end with MVP, upcoming matches, player to watch; background videos; automatic, by click (preview → take) or a fixed OBS URL per scene |
| 🎥 **Camera control (HLAE)** | Start CS2 via HLAE from the app, save camera views per map, jump to them with one click, fly smooth camera paths through them and save paths for the broadcast (one click, Stream Deck, signals), pick each player to spectate or let the CS2 auto director choose (also from the Stream Deck); starts in the free camera when a demo loads and runs your console commands on load / back in the menu |
| 🎛️ **Director** | Control panel in the browser, also on a tablet or a second PC (LAN with PIN); captain veto links for the team captains' phones |
| 🔌 **Integrations** | Stream Deck / Bitfocus Companion URLs with button feedback, configurable global shortcuts, OBS WebSocket (OBS follows the TacAM scene), signals (game events → overlays, Companion buttons, webhooks, OBS replay buffer), MatchZy config export |
| 🖼️ **HUD import** | Import HUDs in the LHM / JTs-Hud format (zip with `hud.json`) and run them as their own OBS source, with their own settings panel |
| 🎨 **Theme editor** | Colors, corner radius, font, sponsors, brand and tournament logo – with live preview |
| 🗂️ **Manager** | Players and teams (CSV import and export, quick setup from the live game), matches with veto editor, automatic map results, GSI config installation, demo match |
| ⬆️ **Desktop app** | Windows installer with automatic updates; your data stays when updating |

## Screenshots

<details open>
<summary><b>HUD and overlays</b></summary>

**Freezetime** – round history, map series, utility, team money and the economy box:

![HUD during freezetime](docs/images/hud-freezetime.webp)

| Scoreboard overlay | Economy graph |
| --- | --- |
| ![Scoreboard overlay](docs/images/overlay-scoreboard.webp) | ![Economy graph overlay](docs/images/overlay-economy.webp) |
| **Player comparison** | **Round win probability** (estimate, under the match bar) |
| ![Player comparison overlay](docs/images/overlay-comparison.webp) | ![Win probability bar](docs/images/hud-win-probability.webp) |

</details>

<details open>
<summary><b>Broadcast scenes</b></summary>

| Halftime | Match end with MVP |
| --- | --- |
| ![Halftime scene](docs/images/scene-halftime.webp) | ![Match end scene](docs/images/scene-matchEnd.webp) |
| **Starting soon** (optional countdown) | **Map veto** |
| ![Starting soon scene](docs/images/scene-starting.webp) | ![Map veto scene](docs/images/scene-veto.webp) |
| **Upcoming matches** | **Player to watch** |
| ![Upcoming matches scene](docs/images/scene-upcoming.webp) | ![Player to watch scene](docs/images/scene-playerToWatch.webp) |

</details>

<details open>
<summary><b>Control panel</b> (browser, also on a second device)</summary>

| Live | Director |
| --- | --- |
| ![Control panel: live](docs/images/control-live.webp) | ![Control panel: director](docs/images/control-director.webp) |
| **Camera** (HLAE views and paths) | **Statistics** |
| ![Control panel: camera](docs/images/control-camera.webp) | ![Control panel: statistics](docs/images/control-stats.webp) |
| **Theme editor** with live preview | **Integrations: signals** |
| ![Control panel: theme editor](docs/images/control-theme.webp) | ![Control panel: integrations with signals](docs/images/control-integrations.webp) |
| **HUDs** (built-in + imported) | **Captain veto** on a phone |
| ![Control panel: HUDs](docs/images/control-huds.webp) | <img src="docs/images/veto-phone.webp" alt="Captain veto page on a phone" width="240"> |

</details>

Screenshots come from the built-in demo match; the transparent HUD is shown on a gray background.

## Getting started

### Windows app (recommended)

1. Download `TacAM-HUD-Setup-<version>.exe` from the [latest release](https://github.com/zGLados/TacAM-Hud/releases/latest) and install it. Code signing is being set up ([code signing policy](#code-signing-policy)) – if SmartScreen warns, choose *More info → Run anyway*.
2. The app opens the control panel. **Settings → Install GSI config**, then restart CS2.
3. In OBS add a **browser source** with `http://127.0.0.1:1349/hud/` (1920×1080, leave “Custom CSS” empty).
4. Join a match as spectator / GOTV. Unknown players can be created in the **Live** tab with one click (or all at once with *Quick setup*).
5. No CS2 at hand? **Live → Create demo data → Start demo match.**

New versions are offered by the app on startup (or *TacAM HUD → Check for updates*); teams, players, matches, uploads and settings are kept.

### Camera control (HLAE)

On Windows CS2 only opens its console for other programs when started via [HLAE](https://www.advancedfx.org/) (or Workshop Tools) – a CS2 bug. TacAM handles that:

1. **Settings → HLAE (camera control) → Install HLAE** (downloaded from the official advancedfx release, checksum verified; updates are offered there too).
2. Close CS2, then **Settings → Start CS2** (launch mode HLAE).
3. **Integrations → CS2 console → Connect.** The **Camera** page now shows *Running via HLAE*.
4. Loading a demo / map puts you straight into HLAE's free camera (WASD + mouse, key overview on the Camera page). Fly to a spot and **Save current view**; click a view to jump there, mark several with **+ Path** and **Play path** for a smooth camera flight.

HLAE runs CS2 in insecure mode: fine for demos and your own servers, not for VAC-secured servers.

**What runs where:**

| Normal CS2 (GSI only, VAC-secured) | CS2 via HLAE (`-insecure`, observer PC only) |
|---|---|
| HUD, live statistics, radar, kill feed | Saved camera views and camera paths |
| Scenes, overlays, director, map veto | Free camera when a demo loads |
| Teams and players, theme editor, imported HUDs | Pick a player by click or Stream Deck, next / previous player |
| OBS, Stream Deck / Companion, signals | CS2 auto director as a button |
| | Console commands on demo load and back in the menu |

Imported LHM / JTs-Hud HUDs work with camera control, OBS and Stream Deck too; TacAM's own scenes and overlays need the TacAM HUD.

### Run from source

Requires Node.js ≥ 22.12 and npm ≥ 11 (`npm install -g npm@11`; the npm 10 bundled with Node 22 fails to install the dependencies).

```bash
npm install
npm run build        # shared → hud → control → server
npm start            # server on http://localhost:1349
npm run desktop      # or: build everything and start the Electron app
```

- Control panel: <http://localhost:1349/control/> · HUD: <http://localhost:1349/hud/>
- Data: `~/.tacam-hud/` (override with `TACAM_DATA_DIR`); in the desktop app Electron's `userData` folder (`%APPDATA%\TacAM HUD`).
- Releases: `npm run version:set -- 1.2.3`, a `CHANGELOG.md` entry, then a GitHub release with tag `v1.2.3` builds the Windows installer and update files automatically (`.github/workflows/release.yml`; betas as pre-release `v1.3.0-beta.1`).

### Keyboard shortcuts (desktop app)

Defaults below; every action (scenes, overlays, HUD elements, team swaps) can get its own global shortcut under **Integrations → Keyboard shortcuts**, and the same actions are URLs for Stream Deck / Companion.

| Shortcut | Action |
| --- | --- |
| `Alt+V` / `Alt+B` | Radar bigger / smaller |
| `Alt+N` | Toggle enlarged radar |
| `Alt+O` | Show/hide the HUD |
| `Alt+F` | Reload all HUDs |
| `Alt+H` | HUD overlay window (while the app window is focused) |

## Documentation

| | |
| --- | --- |
| [docs/features.md](docs/features.md) | How the features work: stats, scenes, overlays, integrations, camera, HUD import |
| [docs/architecture.md](docs/architecture.md) | Structure, server modules, data flow, team assignment, security |
| [docs/api.md](docs/api.md) | REST and Socket.io interface |
| [docs/hud-styling.md](docs/hud-styling.md) | Naming scheme (BEM) and CSS structure of the HUD |
| [docs/development.md](docs/development.md) | Workflow, tests, visual regression, releases |
| [docs/lhm-roadmap.md](docs/lhm-roadmap.md) | Feature plan based on LHM.gg |
| [docs/STATUS.md](docs/STATUS.md) | Current state and open tasks |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to help: bugs, ideas, testing, guides, code |

```bash
npm run dev          # server (tsx watch) + HUD (Vite :3500) + control (Vite :3600)
npm test             # Vitest
npm run typecheck
```

## Get involved

TacAM HUD is free and made for the community – no paid tier, no donations. **Everyone can help, with or without code:**

- **Bugs:** [open an issue](https://github.com/zGLados/TacAM-Hud/issues/new/choose) – the bug report form asks for everything needed (version, what you did, screenshots, CS2 console output). In the app: *TacAM HUD → Report a problem on GitHub…* or the *Report issue* button at the bottom of the sidebar (fills in your version); the *GitHub* button next to it opens the project.
- **Ideas and questions:** [Discussions](https://github.com/zGLados/TacAM-Hud/discussions) (*Ideas*, *Q&A*); show your broadcast or theme in *Show and tell*.
- **Testing, guides, translations, code:** see [CONTRIBUTING.md](CONTRIBUTING.md) and the issues labeled [`good first issue`](https://github.com/zGLados/TacAM-Hud/labels/good%20first%20issue) and [`help wanted`](https://github.com/zGLados/TacAM-Hud/labels/help%20wanted).

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) – being set up: releases up to v0.2.0 are unsigned, so Windows SmartScreen may warn (*More info → Run anyway*).

- Only the Windows installer built by the [release workflow](.github/workflows/release.yml) on GitHub Actions from this public repository is signed – never builds from a local machine.
- Committers and reviewers: [zGLados](https://github.com/zGLados). Changes from other contributors are reviewed before they are merged.
- Approvers: [zGLados](https://github.com/zGLados) – every release is approved for signing by hand.
- All team members use multi-factor authentication for GitHub and SignPath.

## Privacy

TacAM HUD runs on your own PC and has no account, analytics or telemetry. It only connects to other systems in these cases:

- **Update check** (desktop app, on startup and via *Check for updates*): asks GitHub (`github.com/zGLados/TacAM-Hud/releases`) for a newer version and downloads it after you agree.
- **HLAE** (Settings → HLAE): asks the GitHub API for the latest [advancedfx](https://github.com/advancedfx/advancedfx) release and downloads it when you install or update it.
- **Integrations you set up yourself:** OBS WebSocket, HTTP requests of signals (e.g. Bitfocus Companion, webhooks), the CS2 console, Stream Deck / Companion calling TacAM.
- **Report a problem** opens the GitHub issue form in your browser.
- **Imported HUDs** run their own code and may load content from elsewhere – only import HUDs you trust.

GitHub's [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies to the requests to GitHub. Your teams, players, matches and settings stay in the local data folder.

## License & credits

GPL-3.0-only. Design: [TacAM-Hud-Skin](https://github.com/zGLados/TacAM-Hud-Skin). Weapon/status icons and component structure based on [lexogrine/cs2-react-hud](https://github.com/lexogrine/cs2-react-hud) (MIT), GSI parsing with [csgogsi](https://github.com/lexogrine/csgogsi) (MIT). Cache radar and map banners from [JTs-Hud/OpenHud](https://github.com/JohnTimmermann/JTs-Hud) (GPL-3.0). Camera control uses [HLAE / advancedfx](https://github.com/advancedfx/advancedfx), downloaded separately at runtime. Details: [THIRD_PARTY.md](THIRD_PARTY.md).
