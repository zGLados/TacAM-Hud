# Features im Detail

## Live-Statistiken (`packages/shared/src/stats.ts`)

CS2-GSI liefert **keine Kill-Events**. `inferKills(prev, cur)` vergleicht deshalb aufeinanderfolgende Updates: gestiegene `deaths` = Opfer, gestiegene `kills` = Killer (bevorzugt Gegner), gestiegene `assists` = Assister, gestiegene `round_killhs` = Headshot, aktive Waffe des Killers = Waffe. Nicht ermittelbar: Flash-Assist, Wallbang, No-Scope, Utility-Schaden.

`StatsTracker` pro Map:

| Wert | Berechnung |
| --- | --- |
| ADR | `round_totaldmg` am Rundenende, laufende Runde zählt ab Rundenstart mit |
| KAST | Runde mit Kill, Assist, Überleben (HP > 0 bei Rundenende) oder Trade (Killer stirbt binnen 5 s) |
| Opening K/D | erster Kill der Runde |
| Clutch | letzter Lebender seines Teams vs. ≥ 1 Gegner, Team gewinnt |
| Rating | HLTV 1.0: (KillRating + 0,7·SurvivalRating + MultiKillRating) / 2,7 |
| Economy | Equipment-Summe bei Freezetime-Ende → `pistol` (Runde 1/13), `eco` < 5k, `semi` < 10k, `force` < 20k, sonst `full` |

Robustheit: Map-Wechsel/Warmup → Reset. **Backup-Restore / `mp_restartgame`**: zu jeder Rundennummer wird beim Start ein Snapshot der Summen gespeichert; startet eine bekannte Runde erneut, wird auf den Snapshot zurückgerollt und spätere Runden verworfen. Ergebnis- und Siegerermittlung nutzt CS2-MR12 / MR3-Overtime (csgogsi-Default MR15 wird überschrieben).

Am Map-Ende (csgogsi-Event `matchEnd`) trägt der Server Score und Sieger ins Veto des aktuellen Matches ein und erhöht die Serien-Siege.

## Szenen

`SceneState { active, auto, message, countdownTo }`. Szenen: `live`, `starting`, `brb`, `pause`, `halftime`, `veto`, `scoreboard`, `matchEnd`. Mit `auto` schaltet der Server zwischen `live` ↔ `pause` (Spielphase `paused`), `halftime` (Map-Phase `intermission`) und `matchEnd` (`gameover`) – aber nur, wenn gerade eine dieser Szenen aktiv ist; vom Producer gewählte Szenen bleiben stehen. Vollbild-Szenen blenden das In-Game-HUD aus.

## HUD-Konfiguration („Panel“)

`HudConfig`: Trivia, Seitenboxen (Titel/Untertitel/Logo), Spieler- und Match-Vorschau, Teams tauschen, Radargröße, Sichtbarkeit einzelner Elemente, Teamlogo als Avatar. Änderungen gehen per Socket sofort an alle HUDs. HUD-Aktionen (`radarBigger`, `radarSmaller`, `toggleRadarView`, `toggleHud`) sind flüchtig und kommen von Tastenkürzeln oder Buttons.

## Theme-Editor

`Theme.colors` → CSS-Variablen `--color-<key>` (`primary`, `panel`, `panel-strong`, `ct`, `t`, `money`, `bomb`, `defuse`, `border`, `text`, `text-muted`), dazu `--radius`, `--hud-font`, Sponsoren (Rotation, Intervall), Marken- und Turnierlogo. Die Vorschau im Editor bekommt ungespeicherte Änderungen per `postMessage` (`tacam:theme-preview`, nur gleiche Origin); OBS sieht erst gespeicherte Themes.

## Regie von einem zweiten Gerät

Einstellungen → LAN-Zugriff + PIN, App neu starten. Das Control-Panel zeigt die LAN-URLs. Auf dem anderen Gerät einmal PIN eingeben (Cookie 30 Tage). Ein HUD auf einem anderen PC (z. B. OBS-Rechner) bekommt `?token=<token>` an die URL.

## Demo-Match

`apps/server/src/demo.ts` simuliert ein komplettes Match auf de_mirage (Kauf, Bewegung, Kills, Bombe, Defuse, Halbzeit, Game-Over) als echte GSI-Payloads. *Demo-Daten anlegen* erzeugt passende Teams, Spieler und ein BO3. Echte GSI-Daten stoppen die Demo automatisch.

## Bekannte Grenzen

- Kein Killfeed-Detail (Flash/Wallbang/No-Scope), kein Utility-Schaden – nicht in CS2-GSI.
- Keine Spieler-Kameras (WebRTC) und kein „Bring your own HUD“ wie in JTs-Hud.
- Kein Spectator-Binds-Tool (Telnet-Einstellungen sind vorbereitet).
- `react-router-dom` 6 hat zwei mittlere Advisories (Backslash-Redirect in `<Link>`, SSR-Hydration) – im Panel nicht ausnutzbar (nur feste Routen, kein SSR); Fix erst mit v7.
