# Roadmap: CS2 features from LHM.gg

Analysis of the CS2 feature set of [LHM.gg](https://lhm.gg) (Lexogrine HUD Manager), compared with TacAM HUD, and a plan for adopting the useful parts. Sources: lhm.gg feature pages and the [LHM user guide](https://guide.lhm.gg) (October 2026). LHM is a commercial cloud product; this plan only takes over ideas, no code or assets.

Status: **phase 1 done** (all seven items); phases 2 and 3 are proposals.

## 1. What LHM offers for CS2

| Area | LHM feature | Short description |
| --- | --- | --- |
| HUD | Ultra / Premium HUD + 4 more designs | Several layouts (default/top/bottom) and color palettes, layout switch by keybind |
| HUD | Full scoreboard, bottom scoreboard | Overlays on top of the in-game HUD, toggled by key |
| HUD | Economy graph | Money/equipment per round over the whole map |
| HUD | Player comparison | Two chosen players side by side |
| HUD | Custom radar, custom kill feed, bomb/defuse animation, round history, utility & money | Standard HUD elements |
| HUD | Veto history, pre/post-match overlays, sponsor/image bars, tournament box | Series and branding |
| HUD | Custom game modes | 1v1 / 2v2 (wingman) layouts |
| Data | Players, teams, matches, spreadsheet import, custom fields | Database |
| Data | Tournaments | Single/double elimination, Swiss; matches bound to the bracket, automatic progression |
| Data | Get5 config generator | Match JSON (teams, SteamIDs, maps, sides) for a dedicated server |
| Live | Live tab, LHM Quick, CG mode | Create players from live data, quick setup, compact all-in-one view |
| Live | Side switching | Manual swap (`Alt+R`, REST), "auto switch" by SteamID, halftime behaviour (none / swap / keep sides) |
| Veto | LHM Veto | LAN or online veto: captains get links, vote step by step; broadcast overlay + fullscreen stage view |
| Control | Keybinds editor | All HUD actions on free keys |
| Control | Stream Deck | Native Elgato integration: toggle features, refresh HUDs, swap sides, HUD actions |
| Control | LHM Signals | Game events (e.g. round end, filtered by team/side) press buttons in Bitfocus Companion |
| Control | Addons | Server-side plugins with GSI data (e.g. ATEM, MIDI) |
| Cameras | LHM Cameras | Player webcams peer to peer via a browser link, replace avatars in the HUD, adjustable delay |
| Cameras | Camera Mixer | vMix shows the cam of the spectated player automatically |
| Replays | LHM Replays | Second PC on a delayed CSTV feed records kills (priority: multi-kills, headshots, team kills) and plays them after the round via OBS/vMix |
| AI | Scout Vision | Automatic observer (switches POV), via Workshop Tools or simulated key presses |
| AI | Scout Cinematic | Camera paths per map, round start and action cinematics |
| AI | Scout Predict | Round and match win prediction in the HUD |
| Business | Cloud storage, HUD sharing/renting, signal ads, MCP, other games | Not relevant for TacAM HUD |

## 2. Already in TacAM HUD

Players/teams/matches with CSV import (players), creating players from the live game, map veto with veto scene, custom radar (incl. Cache), kill feed (own or CS), round history, economy box with buy classification, bomb/defuse timer, utility/money, sponsors, tournament logo/name, theme editor, pre/post-match scenes (starting soon, BRB, pause, halftime, match end, upcoming, player to watch, scoreboard scene), automatic scenes, team assignment by SteamID on every update (= LHM "auto switch"), manual side swap, fixed keyboard shortcuts in the desktop app, LAN control with PIN, live stats (ADR, KAST, rating, clutches, multi-kills).

## 3. Gaps and plan

Effort: S ≈ up to half a day, M ≈ 1–2 days, L ≈ several days. Value: how much a typical TacAM broadcast gains.

### Phase 1: HUD overlays and control (high value, low risk)

| # | Feature | Effort | Implementation |
| --- | --- | --- | --- |
| 1 | **Halftime behaviour** | S | Setting `halftimeSides: 'follow' \| 'keep'` in `Settings`. `live.ts` `resolveTeams` already finds teams by SteamID; "keep" pins the left/right orientation per map once both teams are known, instead of the observer-slot rule. Note in the UI: observer slot keys then no longer match the HUD order. |
| 2 | **Scoreboard overlay** | M | New HUD component `ScoreboardOverlay` (both teams, K/A/D, ADR, rating, money, utility) over the live HUD, toggled via `HudAction` `toggleScoreboard`; data from `StatsTracker`. Reuses the scoreboard scene's table. |
| 3 | **Economy graph** | M | Overlay with equipment value per team per round (SVG, no chart library), win markers from `stats.rounds`. `HudAction` `toggleEconomyGraph`. |
| 4 | **Player comparison** | S–M | Director field "Compare players" (two SteamIDs in `HudConfig`) + overlay with the stats of both. |
| 5 | **Configurable keybinds** | M | `settings.keybinds: Record<action, accelerator>`; desktop `registerShortcuts` reads them and re-registers on change; editor in Settings (record key combination, conflict warning). New actions: scoreboard, economy graph, comparison, swap sides, scene take, refresh. |
| 6 | **REST actions for Stream Deck/Companion** | S | `POST /api/actions/:action` (+ scene switch, swap sides) with the LAN token; documented button setup for Bitfocus Companion's generic HTTP module. Covers Stream Deck without a native Elgato plugin. |
| 7 | **Wingman / 1v1** | S | Match setting `mode: 'competitive' \| 'wingman'` → MR8 for csgogsi, HUD panels and scoreboard handle 1–2 players per side. Check with demo data. |

### Phase 2: production workflow

| # | Feature | Effort | Implementation |
| --- | --- | --- | --- |
| 8 | **Captain veto** | M | Veto session per match: `/veto/<token>` page per captain (no PIN needed, random token per team, can be regenerated), steps from `vetoTemplate`, optional side choice after a pick; server validates order and writes into `match.vetos` → veto scene updates live. Optional "LAN mode" (one device) and fullscreen stage view (`/hud/?scene=veto&stage=1`). |
| 9 | **Signals (events → Companion/webhooks)** | M | Event rules in settings: event (round end, bomb planted, ace, clutch won, match point, halftime, match end) + filter (team, side) → action (HTTP request, Companion button press `POST /api/location/<page>/<row>/<col>/press`). Events come from `live.ts`/`StatsTracker`. |
| 10 | **OBS WebSocket** | M | Connection to obs-websocket v5 (settings: host, port, password). Uses: switch OBS scenes along with TacAM scenes (mapping table), trigger Signals. Basis for 11 and 13. |
| 11 | **Team import** + Quick setup | S | CSV import for teams (name, short name, country, logo file name); "Quick" dialog in the Live tab: assign both teams and fill players from live data in one step. |
| 12b | **Companion status endpoint** | S | `GET /api/status?key=` with active scene, overlay and toggles, so Companion buttons can show state (feedback/variables via polling). Cheaper than a native Elgato plugin. |
| 12 | **MatchZy config export** | S | Get5 is CS:GO-only; for CS2 use the MatchZy match JSON (same structure: teams, players with SteamID64, maps, sides). Button "Export server config" on the match. |

### Phase 3: larger features

| # | Feature | Effort | Implementation |
| --- | --- | --- | --- |
| 13 | **Player cameras** | L | WebRTC peer to peer, signalling over the existing Socket.io connection. Player page `/cam/<token>` (choose player + camera), HUD shows the video instead of the avatar (team panels, focus player). Delay to match the CSTV delay: the HUD holds frames in a canvas ring buffer (open question: memory use at 10 × 720p over ~5–10 s; fallback: cams without delay). In LAN no TURN server is needed; online only with a STUN/TURN setting. Follow-up: OBS mode (switch per-player OBS sources via #10). |
| 14 | **Tournaments** | L | New collection `tournaments` with phases (single elimination, double elimination, Swiss), matches bound to bracket slots, automatic progression when a match ends (winner/loser into the next slot, new Swiss round when a round is finished). HUD scene "Bracket" and standings in "Upcoming matches". |
| 15 | **Win probability** | M | Heuristic "Predict" without AI: round win probability from alive players, HP, equipment value, bomb state and time (lookup table/logistic formula with tuned weights), shown as a bar in the match bar. Clearly labeled as an estimate. |
| 16 | **Highlight replays** | L | Without a second PC: OBS replay buffer via #10. On multi-kills/clutches (priority list like LHM) `SaveReplayBuffer`, at round end play the clip in a media source scene and return. Limitation: replays the program output (incl. HUD) instead of a separate camera. The LHM-style two-PC/CSTV setup is out of scope. |
| 17 | **Auto observer** | L, experimental | CS2 accepts console commands over `-netconport` (telnet) → `spec_player <slot>`. Director logic from GSI (duels by position/view direction, bomb carrier, last alive, clutch) with a minimum dwell time; manual takeover pauses it. Must be tested on a real CS2 client first; cinematics (camera paths) are not planned. |

### Not planned

Cloud storage, HUD sharing/renting, signal ads, MCP, other games, CS:GO-only features (AR scoreboard, HLAE/AFX), multiple HUD designs (the theme editor covers colors; extra layouts only if requested), multilanguage HUD.

## 4. Suggested order

1. Phase 1 completely (#1–#7), one release.
2. #8 captain veto and #10 OBS WebSocket, then #9 Signals and #11/#12.
3. Phase 3 one feature at a time, starting with #15 (smallest), then #13 or #14 depending on the event needs; #16/#17 only after testing with a real CS2 setup.
