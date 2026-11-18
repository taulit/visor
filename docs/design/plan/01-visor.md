# 01 · Visor (GNOME-Shell-Extension)

Repo `taulit/visor` · UUID `visor@taulit.github.io` · GSettings `org.gnome.shell.extensions.visor` · GNOME Shell 50 und 51 (`shell-version: ["50","51"]`) · Lizenz GPL-2.0-or-later

Verbindliches Aussehen: `prototype-gnome-island-v4.html?variant=1`. Maße und Tokens stehen in [04-design.md](04-design.md).

## 0. Grundsätze

- **Nur was gerade passiert.** Jedes Modul belegt genau einen Platz: eine Zeile in **Jetzt**, einen Abschnitt in **Ausblick** oder ein Symbol im **Dock**. Nie eine neue Kachel.
- **Ruhe im Leerlauf:**
  - Kein Polling und kein Timer, solange nichts läuft. Alles reagiert auf Signale (D-Bus, Gio, MessageTray).
  - Module bauen ihre Widgets erst beim ersten Öffnen.
  - Dock-Ansichten entstehen erst beim ersten Klick.
- **Nichts blockiert die Shell.** Jedes I/O läuft asynchron (`Gio` async, `Soup.Session.send_and_read_async`, D-Bus async). Kein `GLib.spawn_sync`, kein `GLib.file_get_contents` auf heißen Pfaden.
- **Sauber ausschalten.** `disable()` entfernt jeden Aktor, jedes Signal, jede Quelle und jedes Tastenkürzel. Danach ist die originale Shell exakt wiederhergestellt, auch das Datumsmenü.
- **Code ist klein und lesbar.** TypeScript strict. `tsc` erzeugt ESM-Dateien 1:1 nach `build/`. Keine Bundler, kein Minify, keine Laufzeit-Abhängigkeiten.

## 1. Repo-Aufbau

```
visor/
  src/
    extension.ts          enable/disable, verdrahtet alles, öffentliche API (this.api)
    prefs.ts              Einstellungen (Adw, GTK4) – einzige GTK-Datei
    core/
      notch.ts            Aktorbaum Hals/Ohren/Körper, Zustandsautomat, Positionierung
      motion.ts           Federkurve, easeSpring(actor, props), Respekt vor enable-animations
      theme.ts            Farben aus Panel-Hintergrund und Akzentfarbe → CSS-Klassen/Variablen
      clock.ts            Uhr im Hals (GnomeDesktop.WallClock), Punkt für Ungelesenes
      sheet.ts            Aufbau des offenen Panels: Suchzeile, Dock, Spalten, Ansichten
      peek.ts             Vorschau-Chips (max. 4)
      registry.ts         Module laden/entladen, Slots, Reihenfolge, Lazy-Building
      kit.ts              UI-Bausteine: Section, Row, Button, IconButton, Toggle, Progress, Empty
      keybindings.ts      Super+V, Esc, Pfeiltasten, eigene Kürzel
      search/
        parser.ts         Eingabe → Befehl/Rechnung/Suche (reine Logik, ohne gi-Imports)
        calc.ts           Pratt-Parser, deutsches Dezimalkomma, Prozent (reine Logik)
        currency.ts       EZB-Kurse, Cache, Umrechnung
        providers.ts      Apps, Module, GNOME-Suchanbieter, Zusammenführen und Ranking
        results.ts        Ergebnis-Overlay mit Tastaturnavigation
    modules/
      media.ts  timers.ts  t3/ (client.ts, protocol.ts, module.ts)  downloads.ts
      upcoming.ts  notifications.ts
    lib/                  kleine Helfer: signals.ts (SignalTracker), i18n.ts, http.ts (eine Soup.Session)
  schemas/org.gnome.shell.extensions.visor.gschema.xml
  stylesheet.css          eine Datei; hell/dunkel/hoher Kontrast über Klassen, die theme.ts setzt (verified.md §3)
  po/ (de.po, visor.pot)
  sdk/                    npm-Paket @taulit/visor-module (Typen + connectVisor-Helfer)
  examples/module-template/
  site/                   statische Website (Generator in TS, Ausgabe nach site/dist)
  tests/                  Vitest für reine Logik, Shell-Tests über scripts/
  scripts/                shell-shot.sh, nested.sh, pack.sh, gen-readme-modules.ts
```

Typen kommen von `@girs/gnome-shell` und den passenden `@girs/*`-Paketen für GNOME 50, nur als devDependencies.

## 2. Einbau in die Leiste

- **Datumsmenü ersetzen:**
  - `Main.panel.statusArea.dateMenu.container` verstecken und bei `notify::visible` erneut verstecken (die Leiste zeigt ihn bei jedem Moduswechsel wieder).
  - Einen eigenen Hals-Aktor in `Main.panel._centerBox` an derselben Stelle einfügen.
  - Bei `disable()` den Aktor entfernen und das Datumsmenü wieder zeigen.
- **Uhr:**
  - `GnomeDesktop.WallClock` (`notify::clock`) respektiert Uhrzeitformat, Sekunden und Wochentag aus `org.gnome.desktop.interface`.
  - Rechts neben der Uhr sitzt ein 6 px großer Punkt:
    - Akzentfarbe, wenn es ungelesene Mitteilungen gibt.
    - Bernstein, wenn ein Agent wartet.
    - Sonst ist er nicht sichtbar.
- **Notch-Körper:**
  - Ein `St.Widget` über `Main.layoutManager.addChrome(actor, { trackFullscreen: true })`, direkt über `panelBox` einsortiert. `affectsInputRegion` gibt es in Shell 50 nicht mehr (verified.md §1).
  - Er wird mittig unter dem Hals auf dem Hauptmonitor positioniert und folgt `monitors-changed`.
- **Ohren** (konkave Übergänge links und rechts):
  - Je ein `St.DrawingArea` mit Cairo, Radius 16 px im offenen Zustand und 7 px bei Hover.
  - Neu gezeichnet wird nur bei Größen- oder Farbwechsel, nie pro Frame.
- **Farbe des Körpers:**
  - Immer die tatsächliche Hintergrundfarbe der Leiste: `Main.panel.get_theme_node().get_background_color()`, neu bei `style-changed`.
  - Die Vordergrundfarben richten sich nach der **Helligkeit der Leiste**, nicht nach dem Farbschema. Eine schwarze Leiste im hellen Modus bekommt also helle Schrift (Details in 04).
- **Übersicht:** Öffnet sich die Übersicht (`Main.overview` `showing`), schließt Visor sofort ohne Animation. In der Übersicht ist die Leiste transparent.
- **Vollbild und Sperrbildschirm:**
  - Im Vollbild ist Visor unsichtbar (trackFullscreen).
  - Auf dem Sperrbildschirm ist Visor deaktiviert. Die Extension nutzt keinen `unlock-dialog`-Modus.

## 3. Zustände und Bewegung

| Zustand | Auslöser | Größe des Körpers | Inhalt |
|---|---|---|---|
| idle | Start, Maus weg (nach 250 ms), Esc, Klick außerhalb | Breite des Halses × 0 | – |
| hint | Maus über Hals | Halsbreite + 40 × 8 px, Radius 8 | – |
| peek | 380 ms in hint, oder neues Ereignis (Mitteilung, Agent wartet, Timer fertig) für 3 s | Chip-Breite + 28 × 56 px, Radius 24 | max. 4 Chips |
| open | Klick auf Hals oder Chip, Super+V | 960 × Inhaltshöhe (max. 820 bzw. Monitorhöhe − 120), Radius 30 | Sheet |

- **Federkurve:**
  - Eine gedämpfte Feder (Steifigkeit ≈ 300, Dämpfung ≈ 26, Masse 1) als `Clutter.Timeline`, die Feder wird in `new-frame` selbst gerechnet (`set_progress_func` ist unter GJS 1.88 unbrauchbar, verified.md §2). Sie entspricht der CSS-Kurve `--spring` des Prototyps.
  - Dauer: hint 500 ms, peek/open 620 ms, schließen 400 ms mit ease-out (`EASE_OUT_QUINT`).
- **Billig animieren:**
  - Animiert werden nur Breite und Höhe eines Clip-Containers.
  - Der Inhalt wird einmal auf Endgröße gelayoutet und dann nur noch per Clip enthüllt. So gibt es keinen Relayout pro Frame.
  - Der Inhalt blendet mit Opazität ein (300 ms, 80 ms verzögert) und gleitet von translateY −6 px und scale 0,97. Unschärfe gibt es nicht, sie wäre zu teuer.
- **Schatten:** keiner. Der Körper setzt sich allein durch die Farbe der Leiste ab (2026-11-18 entfernt: der nach dem Einrasten eingeblendete Schatten wirkte fremd).
- **Ohne Animationen:** Bei `org.gnome.desktop.interface enable-animations = false` springen alle Übergänge sofort.
- **Hover-Logik** wie im Prototyp:
  - Verlassen von Hals und Körper startet einen Timer von 250 ms, Wiedereintritt bricht ihn ab.
  - Im Zustand open schließt nur Klick außerhalb, Esc oder erneuter Klick auf den Hals.

## 4. Theme

- **Akzentfarbe:** `St.ThemeContext.get_for_stage(global.stage).get_accent_color()` in JS und `-st-accent-color` im Stylesheet (verified.md §3). Bei Änderung werden die Farben live neu gesetzt.
- **Bernstein `#f6a33b`** ist die einzige zweite Farbe und bedeutet nur „wartet auf dich“.
- **Schrift:** die Schrift der Shell (Adwaita Sans), keine eigene. Größen in 04.
- **Struktur:** Hairlines statt Karten. Flächen gibt es nur für Hover (`surface`), Eingaben und Buttons.
- **Hoher Kontrast:** Ist der Schalter für hohen Kontrast an, werden Hairlines voll deckend und alle Muted-Texte auf 80 % angehoben.

## 5. Sheet (offenes Panel)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔍 Suchen, rechnen oder Befehl …                        │ ▣ ▣ ⊞      │  Suchzeile 56 px, Dock rechts
├──────────────────────────────────────┬───────────────────────────────┤
│ Jetzt                                │ Als Nächstes                  │
│  ♫  Titel – Künstler      ⏮ ⏯ ⏭     │  Morgen  Geburtstag Jukek     │
│  ◉  T3 · visor-core  wartet          │  15:00   Sprint Review [Beitr.]│
│       Ablehnen  [Erlauben]           │  Fr      Abgabe Ausschreibung  │
│  ⏱  Pizza            12:41    ▬▬▬    │                               │
│  ↓  ubuntu.iso   1,2 GB · 40 %       │ Mitteilungen        Nicht stören ◯│
│                                      │  … 3 sichtbar, „Alle 7 anzeigen“│
└──────────────────────────────────────┴───────────────────────────────┘
```

- **Spalten** 1,2fr : 1fr, getrennt durch eine Hairline, 24 px Innenabstand.
- **Eine Spalte:** Hat die linke Spalte nichts (nichts läuft), verschwindet sie. Ausblick nimmt dann die volle Breite bei 600 px Panelbreite. Zeilen zeigen dann `Nichts läuft` nicht. Die Spalte fehlt einfach.
- **Dock:**
  - Symbole der Dock-Module, ganz rechts immer `⊞ Module`.
  - Klick wechselt das Sheet in die Modulansicht mit Zurück-Knopf und Titel (Kopfzeile 56 px). Esc geht zurück.
- **Fokus:**
  - Beim Öffnen hat die Suchzeile den Fokus. Tippen filtert sofort.
  - Pfeil runter springt in die Zeilen, Tab geht durch alle bedienbaren Elemente, Enter löst die Hauptaktion aus.
- **Sekundäre Knöpfe** einer Zeile erscheinen bei Hover oder Tastaturfokus der Zeile.

## 6. Eingebaute Module

Jedes Modul ist eine Datei bzw. ein Ordner unter `src/modules/` und benutzt nur die öffentliche Modul-API (Abschnitt 10), genau wie fremde Module. In den Einstellungen ist jedes Modul abschaltbar.

### 6.1 Medien (Jetzt)

- **Quelle:** ein eigener MPRIS-Proxy über `Gio.DBusProxy`. `ui/mpris.js` der Shell kennt weder Position noch Länge und lässt sich nicht abbauen (verified.md §7).
- **Zeile:**
  - Cover 36 px mit Radius 8, Titel, Künstler.
  - Rechts ⏮ ⏯ ⏭. Abspielen ist ein gefüllter Kreis (`play`-Stil).
  - Darunter ein Fortschrittsbalken 2 px, nur wenn `Position` und `Length` bekannt sind. Aktualisiert wird er nur bei geöffnetem Panel im Sekundentakt.
- **Mehrere Player:** zuletzt aktiver oben, max. 2 Zeilen.
- **Klick auf die Zeile:** `Raise()`.
- **Sichtbarkeit:** Die Zeile ist nur da, solange ein Player `Playing` oder `Paused` meldet und seit maximal 10 min pausiert.
- **Peek-Chip:** Wellen-Symbol + Titel (max. 24 Zeichen).

### 6.2 T3 Code (Jetzt)

Zeigt laufende Agenten-Sessions des lokalen T3-Code-Servers. Freigaben gehen direkt, Antworten nach dem Aufklappen.

**Schritt 1: Protokoll erforschen.** Das Ergebnis kommt nach `docs/t3-protocol.md`. Quelle ist github.com/pingdotgg/t3code (MIT), vor allem `packages/contracts`, `packages/client-runtime`, `apps/server/src/ws*`, `apps/server/src/orchestration-v2`, die Mobile-App `apps/mobile/src/features/connection`. Zu klären:
1. Wie man den lokalen Server findet: Port, Konfigurationsdatei, Umgebung.
2. Wie sich ein Client verbindet und anmeldet, inklusive Geräte-Freigabe wie bei der Mobile-App.
3. Welche Nachrichten es gibt für:
   - Threads und Sessions auflisten (Titel, Projekt, Status running/waiting/done/error)
   - offene Freigaben (Werkzeug, Befehl, Datei)
   - Freigabe erteilen oder ablehnen
   - Antwort senden
   - Turn stoppen
   - letzte Agenten-Nachricht
   - Deep-Link „In T3 Code öffnen“
4. Welche Version des Vertrags gilt, und wie man Inkompatibilität erkennt.

**Schritt 2: Mock-Server.** Ein kleiner Node-Server unter `tests/t3-mock/`, der denselben WebSocket-Vertrag mit Fixtures spricht. Die Fixtures stammen aus den Testkit-Fixtures von t3code, etwa `subagent_v2_approval`. Alle Tests und Screenshots laufen gegen ihn.

**Schritt 3: Modul.**
- **Verbindung:**
  - `Soup.Session.websocket_connect_async`.
  - Nur wenn das Modul aktiv ist und der Server erreichbar.
  - Neuverbindung mit Backoff 1 s → 2 s → … → max. 60 s, und sofort bei `NetworkMonitor`-Änderung.
  - Ohne Server kein Fehler, das Modul bleibt einfach leer.
- **Zeile pro Session:**
  - Kleiner Blob als Statussymbol (Animationen aus dem Prototyp, nur bei geöffnetem Panel), Thread-Titel, Projekt und Status.
  - **Wartend:** Die Zeile bekommt einen Bernstein-Hauch und die Knöpfe `Ablehnen` (ghost) und `Erlauben` (primär). Die Frage (Befehl oder Datei) steht monospace darunter, 1 Zeile, aufklappbar.
  - **Aufgeklappt:** die letzte Agenten-Nachricht (max. 4 Zeilen), dazu `Antworten` (Inline-Eingabe, Enter sendet), `Stoppen` und `In T3 Code öffnen`.
  - **Fertig:** 2 min lang mit Haken sichtbar, dann weg.
- **Mehrere Sessions:** Wartende zuerst, max. 3 Zeilen, dann „+ n weitere“ (öffnet die Liste aufgeklappt).
- **Peek:**
  - Wartende Agenten sind der wichtigste Chip (Bernstein).
  - Auf Wunsch (Einstellung „Bei wartenden Agenten kurz zeigen“, an) wölbt sich die Notch einmal kurz auf peek.

### 6.3 Timer (Jetzt)

- **Anlegen über die Suche:**
  - `timer 25m Pizza`, `timer 1h30 Wäsche`, `timer 90s`
  - Wecker: `timer 18:30 Meeting`
  - Stoppuhr: `stoppuhr` / `stopwatch`
  - Deutsch und Englisch.
- **Zeile:** Name, Restzeit groß (17 px, tabellarische Ziffern), Fortschritt als Hairline. Bei Hover: `+1 min`, Pause/Weiter, Stoppen.
- **Ablauf:** Mitteilung über eine eigene `MessageTray.Source` „Timer“ mit Ton (`global.display.get_sound_player().play_from_theme('complete', …)`). Die Zeile zeigt 2 min „Fertig“ mit `Neu starten`.
- **Speicher:** GSettings-Schlüssel `timers` (JSON-String mit Endzeitpunkten). Timer überleben einen Neustart der Shell.
- **Takt:** Ein einziger `GLib.timeout_add_seconds` für alle Timer, nur solange einer läuft. Neu gezeichnet wird nur bei geöffnetem Panel oder für den Peek-Chip.

### 6.4 Downloads (Jetzt)

- **Erkennung:**
  - `Gio.FileMonitor` auf dem XDG-Download-Ordner.
  - Aktive Downloads sind Dateien mit `.part`, `.crdownload`, `.download` oder `.partial`.
  - Die Größe wird beim Öffnen des Panels und bei Änderungsereignissen gelesen, gedrosselt auf 1/s.
- **Zeile:**
  - Name und aktuelle Größe. Prozent nur, wenn die Endgröße bekannt ist (Firefox-`.part` hat sie nicht, das ist okay).
  - Danach 2 min „Fertig“ mit `Öffnen` und `Im Ordner zeigen` (über `org.freedesktop.FileManager1.ShowItems`).
- **Ehrlich bleiben:** Was keine Endgröße hat, zeigt keinen erfundenen Balken, sondern einen Spinner.

### 6.5 Als Nächstes (Ausblick)

- **Quelle:** die Kalenderdaten, die die Shell schon hat. `DBusEventSource` aus `resource:///org/gnome/shell/ui/calendar.js` über `org.gnome.Shell.CalendarServer` (bestätigt, verified.md §9). Der Dienst liefert nur Titel, Beginn und Ende. Geburtstage kommen über den EDS-Kalender „Geburtstage und Jahrestage“ aus derselben Quelle.
- **Anzeige:**
  - Die nächsten max. 3 Termine in den kommenden 7 Tagen, laufende zuerst.
  - Spalte „wann“ 52 px: `Jetzt`, `15:00`, `Morgen`, `Fr`.
  - Ganztägiges ohne Uhrzeit.
- **Beitreten:**
  - Erkennt Meet-, Teams-, Zoom- und Jitsi-Links in Ort oder Beschreibung. Beides holt Visor asynchron über ECal, erst bei geöffnetem Panel und nur für Termine im Beitreten-Fenster. Fehlt die Typelib, gibt es keinen Knopf.
  - Ab 10 min vor Beginn erscheint der Knopf `Beitreten` (primär).
- **Klick auf eine Zeile:** öffnet GNOME Kalender beim Termin (`gnome-calendar --uuid <quelle>:<uid>[:<rid>]`, bestätigt).
- **Leer:** „Heute nichts mehr“ in leiser Schrift.

### 6.6 Mitteilungen (Ausblick)

- **Quelle:** `Main.messageTray.getSources()`, dazu `source-added`/`source-removed` und je Quelle `notification-added`/`notification-removed`. Medienplayer-Einträge des Shell-Nachrichtenlistenformats werden **nicht** gezeigt, die übernimmt das Medien-Modul.
- **Kopfzeile:** `Mitteilungen`. Rechts bei Hover die Links `Alle löschen` und der Schalter **Nicht stören**. Der Schalter ist Pflicht, denn er war im alten Datumsmenü (`org.gnome.desktop.notifications show-banners`).
- **Liste:**
  - Neueste zuerst, 3 sichtbar, danach `Alle n anzeigen`. Das klappt die volle Liste auf, scrollbar, gruppiert nach App, sobald es mehr als 2 sind.
  - Zeile: App-Symbol 28 px, App-Name, Zeit (`jetzt`, `vor 5 Min.`, `14:02`), Titel und Text (max. 2 Zeilen).
  - Bei Hover ersetzt `×` die Zeit.
- **Bedienung:**
  - Klick löst die Standardaktion aus (`notification.activate()`).
  - Hat die Mitteilung Aktionen, erscheinen sie beim Aufklappen als Buttons.
- **Banner** zeigt die Shell weiterhin selbst. Visor ändert daran nichts.
- **Gelesen:** Öffnen des Panels markiert alles als gesehen, und der Punkt im Hals verschwindet.
- **Super+N** (Fokus auf aktive Mitteilung) bleibt Sache der Shell.

## 7. Suche und Befehle

Ein Feld, ein Overlay mit Ergebnissen unter der Suchzeile, darunter **keine** Vorschlags-Chips. Die Ergebnisse sind gruppiert. Reihenfolge der Gruppen:

1. **Befehl:** `timer …`, `stoppuhr`, `notiz …` (nur wenn das Notizen-Modul aktiv ist), `t3 …` (sendet an den zuletzt aktiven Thread oder startet einen neuen, laut T3-Protokoll), sowie Befehle fremder Module.
2. **Rechnen und Umrechnen:**
   - Eigener Pratt-Parser, kein `eval`. Unterstützt `+ − × ÷ * / ^ %`, Klammern, `sqrt sin cos tan log ln abs round`, `pi e`.
   - Deutsches Komma und Tausenderpunkt je nach Locale. „20 % von 80“.
   - Währung: `100 usd in eur`, `100$ €`, `50 chf`. Ziel ist sonst die Locale-Währung.
   - Kurse: EZB-Tageskurse (`eurofxref-daily.xml`), höchstens 1× pro Tag asynchron geladen, gecacht in `~/.cache/visor/rates.json`. Die Einstellung „Währungskurse laden“ ist an und abschaltbar.
   - Enter kopiert das Ergebnis.
3. **Apps:** `Shell.AppSystem` und `Gio.AppInfo` mit der Fuzzy-Logik der Shell, max. 5. Enter startet die App.
4. **Module:** Suchquellen fremder Module, etwa Notizen über das Notizen-Modul.
5. **GNOME-Suchanbieter:**
   - Über `remoteSearch.loadRemoteSearchProviders(searchSettings)` (bestätigt). Das respektiert `org.gnome.desktop.search-providers` (deaktivierte, Reihenfolge).
   - Max. 3 pro Anbieter, mit Symbol und Name des Anbieters.
   - Gibt es für eine App ein Visor-Modul mit eigener Suche (z. B. Sheaf), wird ihr Remote-Anbieter ausgeblendet. So erscheint nichts doppelt.

**Bedienung:**
- Tasten: ↑↓ wählen, Enter ausführen, Strg+Enter ist die Alternative (z. B. „In App öffnen“), Esc leert erst die Suche und schließt dann.
- Tippen ist entprellt (40 ms). Jede Anfrage hat eine Generation, veraltete Antworten werden verworfen.
- Anbieter antworten asynchron, das Overlay füllt sich gruppenweise, ohne Springen. Gruppen haben feste Positionen.

## 8. Peek-Chips

- Max. 4 Chips, nach Priorität:
  1. wartender Agent
  2. abgelaufener Timer
  3. Termin in < 15 min
  4. laufender Timer
  5. Medien
  6. aktiver Download
  7. ungelesene Mitteilungen (Anzahl)
- Ein Chip ist Symbol + kurzer Text, 12 px.
- Klick auf einen Chip öffnet das Panel. Der zugehörige Bereich wird markiert und, falls nötig, aufgeklappt.
- Neue Ereignisse zeigen 3 s lang peek mit dem Ereignis als erstem Chip (Akzentfarbe), außer bei Nicht stören oder Vollbild.

## 9. Einstellungen (prefs.ts, Adw)

Ein `Adw.PreferencesWindow` mit drei Seiten:

1. **Allgemein:**
   - Tastenkürzel öffnen. Visor übernimmt das Kürzel der Shell für die Mitteilungsliste (Standard Super+V und Super+M), solange es aktiv ist. Ein zusätzliches eigenes Kürzel ist einstellbar (Standard leer), verified.md §5
   - „Vorschau beim Darüberfahren“
   - Verzögerung bis Vorschau (380 ms)
   - „Bei Ereignissen kurz zeigen“
   - Breite (kompakt 800 / normal 960 / breit 1120)
2. **Module:**
   - Liste aller installierten Module, gruppiert nach Jetzt, Ausblick und Dock.
   - Je Modul: Schalter, Reihenfolge per Ziehen, Zahnrad, wenn das Modul eigene Einstellungen hat.
   - Darunter **Entdecken**: Katalog mit Suche, siehe Abschnitt 11.3.
   - Der Knopf `Installieren` ruft `org.gnome.Shell.Extensions.InstallRemoteExtension(uuid)`. Die Shell fragt selbst nach Bestätigung und lädt aus dem Extension-Store.
   - Installierte Module zeigen `Installiert`.
3. **Über:** Version, Links (Website, Code, Fehler melden), Lizenz.

## 10. Modul-API (Version 1)

Eingebaute und fremde Module benutzen dieselbe API. Fremde Module sind **eigene GNOME-Extensions** (UUID-Konvention `visor-<name>@<domain>`). Damit sind sie über den Extension-Store installierbar, geprüft und aktualisierbar. Visor lädt nie fremden Code aus dem Netz.

```ts
// sdk/index.d.ts (Auszug, verbindlich)
export const API_VERSION = 1;

export type Slot = 'now' | 'ahead' | 'dock';

export interface VisorModule {
  id: string;                 // 'notes', eindeutig, a-z0-9-
  name: string;               // übersetzt
  icon: string;               // symbolischer Icon-Name
  slot: Slot;
  enable(ctx: ModuleContext): void;
  disable(): void;
  // Slot 'now':   ctx.now.set([...rows]) / ctx.now.clear()
  // Slot 'ahead': buildSection(): St.Widget     (erst beim ersten Öffnen aufgerufen)
  // Slot 'dock':  buildView(): St.Widget        (erst beim ersten Klick aufgerufen)
  buildSection?(): St.Widget;
  buildView?(): St.Widget;
  search?: SearchSource;      // optional: eigene Ergebnisse in der Suche
  commands?: Command[];       // optional: 'notiz <text>' usw.
  replacesSearchProvider?: string; // desktop-ID, deren Remote-Anbieter ausgeblendet wird
  prefs?: (page: Adw.PreferencesPage) => void; // läuft im prefs-Prozess
}

export interface ModuleContext {
  kit: Kit;                   // Section, Row, Button, IconButton, Toggle, Progress, Empty, Chip
  now: { set(rows: NowRow[]): void; clear(): void };
  peek: { set(chip: PeekChip | null): void; flash(chip: PeekChip): void };
  badge(count: number | null): void;          // Dock-Symbol
  settings: Gio.Settings | null;               // eigenes Schema des Moduls
  http: Soup.Session;                          // geteilt, nie eigene Session
  open(view?: string): void; close(): void;
  t: (s: string) => string;                    // gettext der Extension des Moduls
}

export interface NowRow {
  id: string; icon: string | Gio.Icon; title: string; subtitle?: string;
  status?: 'normal' | 'waiting' | 'done';      // waiting = Bernstein
  primary?: Action; actions?: Action[];        // actions erscheinen bei Hover
  expand?: () => St.Widget;                     // optionaler Aufklappinhalt
  progress?: number | 'indeterminate';
}
export interface SearchSource { id: string; title: string; search(q: string, cancel: Gio.Cancellable): Promise<Result[]>; }
export interface Command { keyword: string[]; hint: string; run(args: string): Promise<Result[] | void>; }
```

**Anbindung eines fremden Moduls.** Der Helfer `connectVisor()` aus `@taulit/visor-module` (~50 Zeilen, wird ins Modul kopiert, kein Bundler nötig):
1. Er sucht `Main.extensionManager.lookup('visor@taulit.github.io')`.
2. Ist Visor aktiv, ruft er `visor.stateObj.api.register(module)`.
3. Sonst wartet er auf `extension-state-changed` und registriert dann.
4. Wird Visor deaktiviert, ruft Visor `disable()` auf allen Modulen. Kommt Visor zurück, registriert der Helfer erneut.

**Regeln für Module** (stehen in `sdk/README.md`, werden beim Einreichen in den Katalog geprüft):
- Nur Kit-Bausteine, keine eigenen Farben. So bleibt alles einheitlich und folgt dem Theme.
- Ausnahme: Inhalte wie Cover und App-Symbole.
- Kein Polling ohne sichtbaren Grund, kein synchrones I/O.
- `metadata.json` enthält `"visor": { "api": 1, "slot": "dock" }`.

**API-Stabilität:**
- `API_VERSION` wird nur bei inkompatiblen Änderungen erhöht.
- Visor lädt Module mit unbekannter Version nicht und zeigt das in den Einstellungen an.

## 10a. Module in eigenen Repos

Weitere Module (Spotify-Steuerung, GoodDay, 1Password-Suche, GitHub usw.) entstehen als **eigene Repos**, eins pro Modul. Vorteile: jedes wird einzeln im Store geprüft, hat eigene Versionen und kann auch von anderen gebaut werden.

- **Name:** Repo `visor-<name>`, UUID `visor-<name>@taulit.github.io`, Store-Name „Visor: <Name>“. Das Präfix „Visor“ macht sie im Store und auf GitHub über die Suche nach „visor“ auffindbar.
- **Vorlage:**
  - `examples/module-template/` im Visor-Repo wird zusätzlich als GitHub-Template-Repo `taulit/visor-module-template` veröffentlicht. Neue Module entstehen über „Use this template“.
  - Die Vorlage enthält:
    - `metadata.json` mit `visor`-Feld
    - `extension.ts` mit `connectVisor()`
    - je ein Beispiel für die Slots Jetzt, Ausblick und Dock (zwei davon löscht man)
    - GSettings-Schema
    - `po/`
    - CI, die lint, Typprüfung und die Store-ZIP baut
    - Release-Workflow
    - README-Gerüst mit SEO-Untertitel und Screenshot-Platz
    - eine Checkliste „In den Katalog einreichen“
- **Abhängigkeit:**
  - Das Modul braucht Visor. Ist Visor nicht installiert, zeigt das Modul in seinen Einstellungen einen Hinweis mit Store-Link und tut sonst nichts.
  - Die Store-Beschreibung beginnt mit „Requires Visor“.
- **Gemeinsame Logik** (z. B. Login über das Keyring per `Secret`, OAuth) wird nicht als Paket geteilt, sondern bei Bedarf als kleine Kit-Funktion in die Visor-API aufgenommen. So brauchen Module keine Bundler und keine Laufzeit-Abhängigkeiten.
- **In diesem Projekt** wird nur `visor-module-template` angelegt (und `sheaf/visor-module/` als echtes Beispiel). Weitere Modul-Repos sind nach 1.0 vorgesehen. Die Liste geplanter Module steht in `docs/module-ideas.md`: Spotify, GoodDay, 1Password, GitHub-PRs, Wetter.

## 11. Modul-Katalog: Einreichen, Prüfen, Finden

Ziel: Jeder kann Module bauen und anbieten. Im Katalog (Website und „Entdecken“ in den Einstellungen) erscheinen aber nur Module, die der Maintainer selbst angesehen und freigegeben hat. Visor lädt nie Code aus dem Katalog. Er verweist nur auf Extensions im offiziellen GNOME-Store, die dort zusätzlich geprüft sind.

### 11.1 Repo `taulit/visor-modules`

```
visor-modules/
  modules/<uuid>.json       ein Eintrag pro freigegebenem Modul
  modules/<uuid>/icon.svg  modules/<uuid>/screenshot-*.png   (1–4 Bilder, Pflicht)
  schema/module.schema.json
  .github/ISSUE_TEMPLATE/submit-module.yml    Formular „Modul einreichen“
  .github/pull_request_template.md
  REVIEW.md                 Checkliste des Maintainers
  CODEOWNERS                Freigabe nur durch den Maintainer, Branch-Schutz auf main
  catalog.json              erzeugt beim Merge (alle Einträge + Suchindex)
```

**Eintrag** (`modules/<uuid>.json`):
- `uuid`, `name`, `summary` (ein Satz) und `description` (en Pflicht, weitere Sprachen optional)
- `slot`, `author`, `repo`, `ego_id`, `license` (Open Source Pflicht), `api`, `tags`
- `icon`, `screenshots`: 1–4 Bilder, 1600×1000, zeigen das Modul in Visor
- Erst durch die Freigabe gesetzt: `status` (`listed`, `featured`, `delisted`), `verified` (Autor = Org taulit), `added`

### 11.2 Ablauf (Start: von Hand)

1. **Einreichen.** Issue-Formular mit allen Feldern und Bild-Uploads, oder direkt ein PR mit dem Eintrag. Die Anleitung steht auf der Website unter „Modul einreichen“.
2. **Prüfen durch den Maintainer**, nach `REVIEW.md`:
   - Nutzen klar
   - genau ein Slot
   - sieht aus wie Visor
   - im GNOME-Store freigegeben
   - Open-Source-Lizenz
   - Screenshots ehrlich
   - kein Datensammeln ohne Hinweis
   - kurz selbst ausprobiert
3. **Freigeben.** Der Maintainer merged den PR bzw. legt aus dem Issue den Eintrag an. Ablehnen heißt schließen mit kurzer Begründung.
4. **Veröffentlichen.** Ein einziger Workflow erzeugt beim Push auf main `catalog.json`, prüft dabei das Schema (bricht bei Fehlern ab) und stößt den Website-Build an.
5. **Pflege.** Der Maintainer kann Einträge auf `delisted` oder `featured` setzen. Updates eines Moduls brauchen keine neue Freigabe, die prüft der GNOME-Store.

**Später, wenn Einreichungen zunehmen** (nicht in Session 4, nur in `docs/later.md` notiert):
- automatische Prüfung im PR (Store-Status, `metadata.json`, Lizenz, Bildgrößen, Namenskollision, statische Code-Hinweise)
- Issue-zu-PR-Automatik
- wöchentlicher Recheck auf verwaiste Module

### 11.3 Übersicht und Suche

- **Jedes Modul wird mit Bild gezeigt.** Die Übersicht ist ein Raster aus Karten. Jede Karte hat:
  - den ersten Screenshot als Titelbild (16:10)
  - darunter Icon, Name, Kurzbeschreibung, Autor (Haken bei verified), Slot-Badge
- **Detailansicht:** alle Screenshots als Galerie, die Beschreibung, „Was es zeigt / wann es erscheint“, Installieren, Repo.
- **`catalog.json`** enthält einen kleinen vorberechneten Suchindex: normalisierte Tokens aus Name, Kurzbeschreibung, Tags und Autor, dazu Präfixe.
- **Die Suchlogik ist einmal geschrieben** (`catalog-search.ts`, reines TS, Tippfehler-tolerant) und wird von Website und Visor gemeinsam benutzt.
- **Filter:** Slot (Jetzt, Ausblick, Dock), Tags (Medien, Produktivität, Entwicklung, KI, System), „Von Visor“, Sortierung (empfohlen, neu, Name). „Empfohlen“ steht oben.
- **Visor-Einstellungen → Entdecken:**
  - Dieselben Karten mit Bild, als `Adw`-Raster.
  - Die Bilder werden erst beim Sichtbarwerden geladen und gecacht.
  - `Installieren` ruft `org.gnome.Shell.Extensions.InstallRemoteExtension(uuid)`. GNOME zeigt den eigenen Bestätigungsdialog.

### 11.4 Website (im Visor-Repo, `site/`)

Den Technik-Stack legt Session 4 zu Beginn fest. Die Website kommt **ohne Server und ohne Datenbank** aus, denn der Katalog ist eine statische JSON-Datei aus Git.

| Option | Urteil |
|---|---|
| **Astro (statisch) + Tailwind** | **Empfehlung.** Erzeugt pro Modul eine echte HTML-Seite (gut für SEO), lädt JS nur für Suche und Filter. Bei Bedarf React-Inseln mit shadcn/ui-Bausteinen |
| Vite + React (SPA) | Einfach, aber schlechter für SEO, weil die Modulseiten erst im Browser entstehen |
| TanStack Start, Next.js | Für eine statische Katalogseite überdimensioniert. Erst sinnvoll, wenn es Konten, Bewertungen oder eine Datenbank braucht |

- **Hosting:** GitHub Pages (`taulit.github.io/visor`). Neu gebaut bei Push in visor und wenn `visor-modules` einen neuen Katalog veröffentlicht (`repository_dispatch`).
- **Seiten:**
  - Start: Video oder GIF der Notch, drei Sätze, Installieren
  - Module (Übersicht mit Suche, siehe 11.3)
  - je Modul eine Seite
  - Notizen (Sheaf)
  - „Modul bauen“: Anleitung, Link zur Vorlage
  - „Modul einreichen“
- **SEO:**
  - eigener `<title>` und `meta description` je Seite
  - OpenGraph-Bilder aus den Screenshots
  - `sitemap.xml`
  - JSON-LD `SoftwareApplication`
  - Begriffe: „GNOME notch“, „dynamic island for Linux“, „GNOME Shell extension“
- **Aussehen** wie Visor (04): Akzentblau, Adwaita Sans, hell und dunkel. Seitengewicht < 150 kB ohne Bilder.
- Die README von Visor verlinkt Übersicht und „Modul einreichen“.

## 12. Abnahme Visor (Auszug, vollständig in 05)

- Alle Zustände und Module sind per Screenshot (hell/dunkel, Akzent blau und grün) gegen den Prototyp abgeglichen.
- Enable/Disable 50× ohne Warnungen und ohne wachsende Aktoren- oder Signalzahl. Danach ist das Datumsmenü wieder da.
- Leerlauf: 0 Wakeups durch Visor über 60 s (gemessen mit `powertop` oder Zählern im Debug-Build).
- Öffnen < 16 ms Arbeit im Main-Loop pro Frame, kein Frame-Drop auf 60 Hz.
