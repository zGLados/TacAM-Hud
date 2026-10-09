# Schnittstellen

Alle Pfade unter `http://localhost:1349/api`. Bodies sind JSON und werden mit zod validiert (400 mit Fehlertext bei ungültigen Daten).

## REST

| Methode & Pfad | Zweck |
| --- | --- |
| `GET /bootstrap` | Alles, was ein HUD beim Start braucht (`HudBootstrap`) |
| `GET/POST /players`, `PUT/DELETE /players/:id` | Spieler (SteamID64 = 17 Ziffern, eindeutig → 409) |
| `POST /players/import` | Array von Spielern, Upsert per SteamID |
| `GET/POST /teams`, `PUT/DELETE /teams/:id` | Teams (Löschen entfernt die Zuordnung der Spieler) |
| `GET/POST /matches`, `PUT/DELETE /matches/:id` | Matches inkl. Veto; nur ein Match ist `current` |
| `GET /matches/current` | aktuelles Match |
| `POST /matches/:id/current` | als aktuell setzen/aufheben |
| `POST /matches/:id/reverse-current-map` | `reverseSide` der laufenden Map umschalten |
| `POST /uploads` (multipart `file`) | Bild hochladen → `{ file, url }`; `DELETE /uploads/:file` |
| `GET/PUT /hud/config` | HUD-Konfiguration |
| `POST /hud/action` | `{ type: 'radarBigger' \| 'radarSmaller' \| 'toggleRadarView' \| 'toggleHud' }` |
| `POST /hud/refresh` | alle HUDs neu laden |
| `GET/PUT /theme`, `GET/PUT /scene` | Theme, Szene |
| `GET /live` | `{ status, summary }` |
| `GET /live/raw` | letzte GSI-Rohdaten (Debugging, Test-Fixtures) |
| `GET /stats`, `POST /stats/reset`, `GET /killfeed` | Statistik |
| `GET/PUT /settings` | Steam-Pfad, LAN-Zugriff, PIN, Telnet; GET liefert zusätzlich `gsiPort`, `cs2CfgDir`, `gsiInstalled`, `addresses` |
| `POST /settings/install-gsi`, `GET /settings/gsi-config` | GSI-Config installieren / herunterladen |
| `GET /demo`, `POST /demo/start`, `POST /demo/stop`, `POST /demo/seed` | Demo-Match |
| `POST /auth/login` `{ pin }`, `GET /auth/status` | LAN-Anmeldung |

Statische Pfade: `/hud/`, `/control/`, `/uploads/<datei>`.

## Socket.io

Client → Server: `hello('hud' | 'control')` (Raum beitreten).

Server → Client (Typen in `packages/shared/src/types.ts`, `ServerToClientEvents`):

| Event | Inhalt | Empfänger |
| --- | --- | --- |
| `update` | `{ raw, teams: { left, right } }` – GSI-Rohdaten + Team-Extensions | alle |
| `kill` | `KillFeedEntry` | alle |
| `stats` | `StatsSnapshot` (bei Kills/Rundenende) | alle |
| `config` / `theme` / `scene` / `match` / `teams` / `players` | nach Änderungen | alle |
| `action` | HUD-Aktion | alle |
| `refresh` | Seite neu laden | alle |
| `live` | `LiveSummary` (max. 2/s) | `control` |
| `gsiStatus` | `{ connected, lastUpdate, map, phase }` (alle 2 s) | `control` |

## GSI

CS2 postet an `http://127.0.0.1:23415/` mit `auth.token`. Die Config (`gamestate_integration_tacam.cfg`) erzeugt `apps/server/src/gsiInstall.ts`; sie landet in `<Steam-Library>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/`.
