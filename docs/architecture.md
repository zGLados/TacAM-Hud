# Architektur

npm-Workspaces-Monorepo, alles TypeScript.

```
packages/shared   Typen, StatsTracker, Kill-Inferenz, Format-Helfer (von allen genutzt)
apps/server       Express + Socket.io, GSI-Empfänger, JSON-Store, REST-API, Demo-Match
apps/hud          React/Vite – das OBS-Overlay (/hud/)
apps/control      React/Vite – Control-Panel/Regie (/control/)
apps/desktop      Electron-Hülle: startet den Server im Main-Prozess, Fenster, Shortcuts
```

## Ports

| Port | Zweck | Bindung |
| --- | --- | --- |
| 1349 | HTTP (HUD, Control, API, Uploads) + Socket.io | `127.0.0.1`, mit LAN-Zugriff `0.0.0.0` |
| 23415 | GSI-Empfänger (CS2 → POST `/`) | immer `127.0.0.1` |

Überschreibbar mit `HUD_PORT` / `GSI_PORT`.

## Datenfluss

```
CS2 ──POST (Token)──▶ GSI-Server ──▶ LiveHub.ingest(raw)
                                      ├─ Coaches herausfiltern
                                      ├─ Teams auflösen (resolveTeams)
                                      ├─ csgogsi.digest → CSGO
                                      ├─ StatsTracker.update → Kill-Events + Stats
                                      ├─ Szenen-Automatik
                                      └─ Socket.io: update / kill / stats / scene / live
HUD:    GSI-Rohdaten + Team-Extensions → eigenes csgogsi.digest → React
Control: REST + Socket.io (live, stats, scene, config, gsiStatus)
```

Der HUD parst die Rohdaten selbst (gleiches csgogsi), damit Events wie `roundEnd` lokal verfügbar sind. Der Server schickt jedem neu verbundenen HUD sofort das letzte Update (`lastPayload`), damit ein Reload nicht bis zum nächsten Tick leer bleibt.

## Teamzuordnung

csgogsi bestimmt links/rechts über Observer-Slots (niedrigere Slots = links). Welches **Datenbank-Team** auf welcher Seite spielt, ermittelt `LiveHub.resolveTeams` über die Team-Zugehörigkeit der verbundenen Spieler (mind. 2 Spieler pro Seite). Fallback: linkes/rechtes Team des aktuellen Matches, ggf. gedreht durch `veto.reverseSide`. So bleiben Logos und Namen nach dem Seitenwechsel zur Halbzeit korrekt.

## Persistenz

`apps/server/src/store.ts`: eine `db.json` (Collections `players`, `teams`, `matches`; Dokumente `settings`, `hudConfig`, `theme`, `scene`), im Speicher gehalten, gedrosselt und atomar (tmp + rename) geschrieben. Beim Laden werden gespeicherte Werte tief über die Defaults gemergt, neue Felder bekommen so sinnvolle Werte. Bewusst kein SQLite: keine nativen Module in Electron.

Jede Änderung löst `store.on('change')` aus; `app.ts` verteilt daraufhin `players`/`teams`/`match`/`config`/`theme`/`scene` an alle Clients.

## Sicherheit

- GSI-Daten nur mit dem geheimen Token aus `settings.gsiToken` (steht in der installierten Config).
- Lokale Anfragen (127.0.0.1/::1) sind immer erlaubt. Entfernte nur bei aktivem LAN-Zugriff **und** gültigem Token (Cookie `tacam_token`, Header `x-tacam-token` oder `?token=`), den man per PIN über `/api/auth/login` bekommt. Token = HMAC(PIN) – PIN-Wechsel macht alte Sessions ungültig.
- Uploads: nur Bildtypen, 8 MB, ausgeliefert mit strikter CSP + `nosniff` (SVGs können kein Script ausführen).
- Theme-Farben werden per Regex validiert, bevor sie als CSS-Variablen im HUD landen.
- Electron-Fenster: `contextIsolation`, `sandbox`, externe Links im System-Browser.
