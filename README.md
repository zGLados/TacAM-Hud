# TacAM HUD

CS2-Broadcast-HUD und HUD-Manager mit dem TacAM-Design – inspiriert von [JTs-Hud](https://github.com/JohnTimmermann/JTs-Hud), aber eigenständig gebaut und um Live-Statistiken, Broadcast-Szenen, Web-Regie und einen Theme-Editor erweitert.

| Bereich | Was es kann |
| --- | --- |
| **HUD** (OBS-Browserquelle) | Matchbar, Teamboxen, beobachteter Spieler, Radar (10 Maps inkl. neuem Cache), Killfeed, Bomben-/Defuse-Timer, Utility/Geld, Map-Serie, Trivia, Spieler-/Match-Vorschau, Sponsoren |
| **Neu: Stats** | ADR, KAST (inkl. Trades), HS %, KPR, Opening Kills/Deaths, Clutches, Multikills, HLTV-1.0-Rating, Rundenverlauf, Economy (Buy-Klassifizierung) |
| **Neu: Szenen** | Starting Soon (Countdown), BRB, Technische Pause, Halbzeit, Map-Veto, Scoreboard, Match-Ende mit MVP – automatisch oder per Klick |
| **Neu: Web-Regie** | Control-Panel im Browser, auch auf Tablet/zweitem PC (LAN mit PIN) |
| **Neu: Theme-Editor** | Farben, Radius, Schrift, Sponsoren, Turnierlogo – live mit Vorschau |
| **Manager** | Spieler (inkl. CSV-Import, Anlegen aus dem Live-Spiel), Teams, Matches mit Veto-Editor, automatische Map-Ergebnisse, GSI-Installation, Demo-Match |

## Schnellstart

Voraussetzung: Node.js ≥ 18.19 (für die Desktop-App ≥ 22.12, siehe unten).

```bash
npm install
npm run build        # shared → hud → control → server
npm start            # startet den Server auf http://localhost:1349
```

- Control-Panel: <http://localhost:1349/control/>
- HUD für OBS: <http://localhost:1349/hud/> (Browserquelle 1920×1080, „Eigenes CSS“ leer)
- Ohne CS2 testen: Control-Panel → **Live** → *Demo-Daten anlegen* → *Demo-Match starten*

### CS2 verbinden

1. Control-Panel → **Einstellungen** → *GSI-Config installieren* (Steam-Ordner wird automatisch gesucht, sonst eintragen).
2. CS2 neu starten und als Zuschauer/GOTV in ein Match gehen.
3. Im **Live**-Tab unbekannte Spieler mit einem Klick anlegen und Teams zuordnen.

### Desktop-App (Electron)

```bash
npm run desktop      # baut alles und startet die App
npm run dist         # Installer (Windows NSIS/Portable, Linux AppImage, macOS dmg)
```

Die App startet den Server intern, öffnet das Control-Panel und registriert globale Tastenkürzel. Electron 43 benötigt zum Installieren/Bauen **Node ≥ 22.12**; Server, HUD und Control-Panel laufen auch mit Node 18.

### Tastenkürzel (Desktop-App)

| Kürzel | Aktion |
| --- | --- |
| `Alt+V` / `Alt+B` | Radar größer / kleiner |
| `Alt+N` | Radar groß/klein umschalten |
| `Alt+O` | HUD ein-/ausblenden |
| `Alt+F` | alle HUDs neu laden |
| `Alt+H` | HUD-Overlay-Fenster (im Fenster fokussiert) |

## Entwicklung

```bash
npm run dev          # Server (tsx watch) + HUD (Vite :3500) + Control (Vite :3600)
npm test             # Vitest: Stats-Engine + Server-API
npm run typecheck
```

Weiterführend:

- [docs/architecture.md](docs/architecture.md) – Aufbau, Datenfluss, Teamzuordnung
- [docs/features.md](docs/features.md) – Stats-Berechnung, Szenen, Theme, LAN-Zugriff
- [docs/api.md](docs/api.md) – REST- und Socket.io-Schnittstelle
- [docs/hud-styling.md](docs/hud-styling.md) – Namensschema (BEM) und CSS-Struktur des HUD
- [docs/development.md](docs/development.md) – Workflow, Tests, visuelle Regression, Release
- [CLAUDE.md](CLAUDE.md) – Hinweise für KI-Assistenten

## Daten

Alles liegt lokal: Standalone unter `~/.tacam-hud/` (`TACAM_DATA_DIR` überschreibt), in der Desktop-App im Electron-`userData`-Ordner (`db.json` + `uploads/`).

## Lizenz & Credits

GPL-3.0-only. Design: [TacAM-Hud-Skin](https://github.com/zGLados/TacAM-Hud-Skin). Waffen-/Status-Icons und Komponentenstruktur nach [lexogrine/cs2-react-hud](https://github.com/lexogrine/cs2-react-hud) (MIT), GSI-Parsing mit [csgogsi](https://github.com/lexogrine/csgogsi) (MIT). Cache-Radar und Map-Banner aus [JTs-Hud/OpenHud](https://github.com/JohnTimmermann/JTs-Hud) (GPL-3.0). Details: [THIRD_PARTY.md](THIRD_PARTY.md).
