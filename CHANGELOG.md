# Changelog

All notable changes to TacAM HUD. Versions follow [semantic versioning](https://semver.org/): new features raise the minor version (0.**2**.0), fixes the patch version (0.2.**1**); 1.0.0 comes once TacAM has carried a real broadcast. Betas (`-beta.N`) are test builds before a release – see [docs/development.md](docs/development.md#versions-and-releases).

## Unreleased

### Added
- Contributing guide, Code of Conduct and GitHub Discussions; website sections for getting involved, the roadmap and FAQ, and which features need HLAE.

## [0.3.0] – 2026-10-11

### Added
- **CSV export** for players and teams (Players / Teams → Export CSV) in the import format: edit in Excel and import again, or move to another PC.
- **Code signing prepared** (SignPath Foundation, free for open source): code signing policy and privacy statement in the README; the release build signs the installer once SignPath is set up.
- **GitHub and Report issue buttons** under the version at the bottom left.
- **Report a problem:** button at the bottom of the sidebar, under Settings → App updates and in the app menu (*TacAM HUD → Report a problem on GitHub…*) – opens the GitHub bug report form with your version filled in. Issue forms for bug reports and feature requests.

### Fixed
- **Saving a camera path did nothing in the desktop app**, renaming views and paths neither: they asked for the name with a browser dialog that the app does not support. The path card now has a name field, and names are edited in place (✎, Enter saves, Esc cancels).

## [0.2.0] – 2026-10-11

Camera control is complete: players, CS2 auto director, saved views and saved, smooth camera paths.

### Added
- **Saved camera paths** (Camera → Views & paths): save the selected views, duration and "stay" under a name per map, play them with one click, edit and update them. Every saved path is also a Stream Deck / Companion, shortcut and signal action (*Camera path: …*) – e.g. an overview flight at round start.
- **Speed hint** for camera paths: average speed, and a calmer duration to pick when a flight is fast enough to look choppy in the stream.
- **Version** in the sidebar and under Settings → App updates.
- **Beta updates** (Settings → App updates): optionally also get test builds (GitHub pre-releases) through the in-app updater.
- This changelog.

### Changed
- **Smoother camera paths:** a smooth curve through all views, even speed (time spread by distance and turning instead of the same time per view), soft start and stop, 20 keyframes per second.
- **Back to the player after a path:** *Stay on the last view afterwards* is off by default.
- **The HUD updates itself after a TacAM update** (OBS kept the old version loaded) – only when nobody sees it: while the HUD is hidden or no game data arrives (map change, menu).
- Versions: all packages carry the app version (`npm run version:set`), and the release build checks that the tag matches.

## [0.1.19] – 2026-10-11
- Camera page in tabs (*Players & director*, *Views & paths*, *Setup*).
- No focused player in the HUD while a HLAE free camera, saved view or camera path runs.
- CS2 auto director (`spec_autodirector`) as button and Stream Deck action with feedback.
- Console commands on demo / map load and back in the main menu.

## [0.1.18] – 2026-10-11
- Choose each player on the Camera page (also Stream Deck: slot 1–0, next / previous).
- Free camera on demo / map load; HLAE key overview.
- Fixed: jumping to a saved view tilted the camera; an old camera stayed at its position after loading another demo (black screen).
- CI on every push (Linux + Windows).

## [0.1.17] – 2026-10-11
- Camera control via HLAE: save views per map, jump to them, camera paths.
- HLAE in its own settings card; README redesign.

## [0.1.16] – 2026-10-10
- Start CS2 via HLAE (`-afxFixNetCon`, console without Workshop Tools); install and update HLAE from TacAM.

## [0.1.15] – 2026-10-10
- Start CS2 runs `cs2.exe` directly; Workshop Tools mode; console only on the configured address.

## [0.1.14] – 2026-10-10
- CS2 console on Windows needs `-tools` (CS2 bug), hints updated; `engine_no_focus_sleep 0` on connect.

## [0.1.13] – 2026-10-10
- CS2 console: LAN address fallback and *Diagnose*.

## [0.1.12] – 2026-10-10
- *Start CS2* with launch options; CS2 console with test buttons; Cache in the default map pool.

## [0.1.11] – 2026-10-10
- Round win probability bar (estimate).

## [0.1.10] – 2026-10-10
- HUD import (LHM / JTs-Hud format) with the imported HUD's own settings.

## [0.1.9] – 2026-10-10
- Grouped sidebar, Integrations page, Director jump bar; Starting Soon without automatic countdown.

## [0.1.8] – 2026-10-10
- Captain veto, OBS WebSocket, signals, quick setup and team CSV, MatchZy config, Stream Deck button feedback.

## [0.1.7] – 2026-10-10
- Overlays (scoreboard, economy, comparison), keep team sides after halftime, Stream Deck / Companion URLs, configurable shortcuts, wingman, coach slots.

## [0.1.6] – 2026-10-10
- Node 22, Vite 8, React Router 7.

## [0.1.5] – 2026-10-10
- Updater test release.

## [0.1.4] – 2026-10-10
- Automatic updates in the desktop app.

## [0.1.3] – 2026-10-10
- English UI; "Default colors" only resets colors.

## [0.1.2] – 2026-10-10
- Director preview / program, halftime scene fix, stats reset after the demo match, editable sponsors and logo.

## [0.1.1] – 2026-10-10
- CS2 kill feed by default; sponsors editable in the theme editor.

## [0.1.0] – 2026-10-10
- First release: broadcast HUD, live statistics, scenes, director, manager, Windows app.

[0.3.0]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.3.0
[0.2.0]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.2.0
[0.1.19]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.19
[0.1.18]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.18
[0.1.17]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.17
[0.1.16]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.16
[0.1.15]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.15
[0.1.14]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.14
[0.1.13]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.13
[0.1.12]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.12
[0.1.11]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.11
[0.1.10]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.10
[0.1.9]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.9
[0.1.8]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.8
[0.1.7]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.7
[0.1.6]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.6
[0.1.5]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.5
[0.1.4]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.4
[0.1.3]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.3
[0.1.2]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.2
[0.1.1]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.1
[0.1.0]: https://github.com/zGLados/TacAM-Hud/releases/tag/v0.1.0
