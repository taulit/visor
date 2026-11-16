# 03 · Sheaf (Notizen-App)

Repo `taulit/sheaf` · App-ID `io.github.taulit.Sheaf` · Anzeigename „Notes“, `Name[de]=Notizen` · Lizenz GPL-3.0-or-later · Untertitel: „Fast, native notes for GNOME – Apple Notes–style, plain Markdown files“

Verbindliches Aussehen: `prototype-notes-app.html?variant=3` (Galerie, Editor schiebt sich herein, Schnellnotiz). Umfang: `NOTIZEN-FEATURES.md`, alles mit „1.0“.

## 1. Repo-Aufbau

```
sheaf/
  crates/
    sheaf-core/     Speicher, Modell, Frontmatter, Ordner-Beobachtung, Index (tantivy), Suchsprache, Vorlagen, Papierkorb
    sheaf-searchd/  D-Bus-Dienst ohne UI (zbus): SearchProvider2 + io.github.taulit.Sheaf1, einziger Index-Schreiber
    sheaf/          GPUI-App (gpui-component + gpui-markdown-editor), CLI-Unterbefehle
  visor-module/     GNOME-Extension „Visor: Notizen“ (TypeScript, siehe Abschnitt 10)
  data/             .desktop, metainfo.xml, Icons (scalable + symbolic), D-Bus-Service-Dateien, search-provider.ini
  po/               gettext (de, en)
  build-aux/        Flatpak-Manifest, AUR PKGBUILD
  docs/design/
```

## 2. Speicherformat

- **Ordner:**
  - Standard ist `$XDG_DOCUMENTS_DIR/<lokalisiert „Notizen“/„Notes“>`, beim ersten Start festgelegt und in den Einstellungen änderbar.
  - Unterordner sind die Ordner der App, beliebig tief.
- **Eine Notiz ist eine Datei** `Ordner/<Titel>.md`.
  - Der Dateiname folgt dem Titel (erste Zeile). Unzulässige Zeichen werden ersetzt, bei Kollision kommt ` 2` dazu.
  - Umbenannt wird entprellt 2 s nach der letzten Titeländerung.
- **Frontmatter (YAML):** nur wenn nötig, minimal. Was der Nutzer nie gesetzt hat, wird nicht geschrieben.

  ```yaml
  ---
  id: 01JD3K…        # ULID, stabil über Umbenennungen
  created: 2026-11-16T10:12:00+01:00
  pinned: true       # nur wenn wahr
  ---
  ```

  Geändert = mtime. Tags stehen im Text als `#tag`, optional zusätzlich `tags:` im Frontmatter (beides wird gelesen).
- **Anhänge:** `Ordner/_attachments/<id>/<datei>`, im Markdown relativ verlinkt. So zeigen auch andere Editoren die Bilder.
- **Papierkorb:** `.trash/` im Wurzelordner.
  - Die Datei behält ihren Namen und bekommt `deleted:` und `from:` ins Frontmatter.
  - Nach 30 Tagen löscht `sheaf-searchd` beim Start endgültig.
- **App-Daten** im Wurzelordner unter `.sheaf/`:
  - `config.toml`: intelligente Ordner als gespeicherte Suchen, Sortierung je Ordner, Spaltenbreiten und eingeklappte Überschriften je Notiz-ID
  - `templates/*.md`
- **Index:** liegt **nicht** im Notizordner, sondern in `$XDG_CACHE_HOME/sheaf/index/`. Er lässt sich jederzeit neu aufbauen.
- **Fremde Änderungen:**
  - Sync, andere Editoren und Git werden über `notify` erkannt.
  - Ist die Notiz offen und ungeändert, wird sie still neu geladen.
  - Ist sie offen und geändert, erscheint ein Banner „Datei wurde extern geändert“ mit `Neu laden` / `Meine behalten` (behalten speichert als `Titel (Konflikt).md`).
  - Sync-Konfliktdateien (`*.sync-conflict-*`, `* (conflicted copy)*`) werden als Notizen mit Hinweis-Badge gezeigt.

## 3. Suche (wichtigstes Merkmal)

- **Engine:** tantivy. Das Schema hat diese Felder:
  - `id`, `path`, `folder`
  - `title` (Gewicht 4), `headings` (2), `tags` (3), `body` (1)
  - `tasks_open` (Zahl), `has_image`, `has_table`, `has_checklist`
  - `created`, `modified`, `pinned`
- **Analyse:**
  - Kleinschreibung, Unicode-Normalisierung, ASCII-Faltung (ä→a, ß→ss) plus deutsche Umschrift (ä→ae) als zweite Variante.
  - Präfixe über Edge-N-Gramme auf `title` und `headings` (2–12 Zeichen).
- **Anfrage:**
  - Jedes Wort ist ein Muss (UND).
  - Pro Wort: exakt ODER Präfix ODER unscharf. Unscharf heißt Distanz 1 ab 4 Zeichen, 2 ab 8 Zeichen.
  - Anführungszeichen = Phrase.
  - Bei Gleichstand gewinnt die zuletzt bearbeitete Notiz.
- **Filter im Feld:**
  - `#tag`, `ordner:arbeit` (`folder:`)
  - `hat:checkliste|bild|tabelle|anhang` (`has:`), `offen:` (offene Aufgaben)
  - `geändert:heute|woche|monat` (`modified:`), `angeheftet:` (`pinned:`)
  - Deutsch und Englisch.
  - Eingegebene Filter werden im Feld als Chip dargestellt.
- **Ergebnis:**
  - Karten mit hervorgehobener Fundstelle (`SnippetGenerator`, max. 2 Zeilen).
  - Enter öffnet die Notiz und springt zur Fundstelle (Editor `find` + `scroll_to`).
- **Leistung:**
  - Ziel: p95 < 30 ms für die Top 50 mit Snippets bei 10.000 Notizen (Benchmark mit erzeugten Notizen in CI).
  - Erster Index von 10.000 Notizen < 10 s im Hintergrund.
- **Nur ein Schreiber:**
  - `sheaf-searchd` ist der einzige Index-Schreiber.
  - Die App öffnet den Index nur lesend (`IndexReader` mit `ReloadPolicy::OnCommitWithDelay`).
  - Speichert die App eine Datei, sieht searchd die Änderung (`notify`) und committet innerhalb von 300 ms.
  - Läuft searchd nicht, startet ihn die App über D-Bus-Aktivierung.

## 4. sheaf-searchd (D-Bus)

- Bus-Name `io.github.taulit.Sheaf.SearchProvider`. Aktivierung über die D-Bus-Service-Datei. Beendet sich nach 5 min ohne Anfrage und ohne laufende App.
- **`org.gnome.Shell.SearchProvider2`:**
  - `GetInitialResultSet`, `GetSubsearchResultSet`, `GetResultMetas` (Titel, Ausschnitt als Beschreibung, Symbol), `ActivateResult` (öffnet die App bei der Notiz und springt zur Fundstelle), `LaunchSearch` (öffnet die App mit der Suche).
  - `search-provider.ini` mit `DesktopId=io.github.taulit.Sheaf.desktop`. Die GNOME-Suche zeigt dann „Notizen“.
- **`io.github.taulit.Sheaf1`** (für Visor und Skripte):
  - `Search(query s, limit u) → a(ssssx)`: id, Titel, Ausschnitt, Ordner, geändert
  - `Recent(limit u) → a(ssssx)`
  - `Create(text s, folder s) → s`: id. Erste Zeile ist der Titel.
  - `Append(id s, text s)`
  - `Open(id s)`, `QuickNote()`
  - Signal `Changed(ids as)`
- Ressourcen: < 15 MB RSS im Leerlauf, keine Wakeups ohne Dateiänderung.

## 5. App-Gerüst

- **Ein Prozess.** Weitere Starts übergeben ihre Argumente über D-Bus (`io.github.taulit.Sheaf` mit `Activate`/`Open`) an die laufende Instanz.
- **Fenster:**
  - Client-Side-Decorations mit gpui-component `TitleBar` und `WindowBorder`, Radius 15, Schatten.
  - Standard 1100×720, Minimum 360×480.
  - Größe und Position werden gespeichert. Die Position nur, wenn der Compositor sie erlaubt, unter Wayland nicht.
- **Theme über das XDG-Portal** (`ashpd`, `org.freedesktop.appearance`):
  - `color-scheme` (hell/dunkel live), `accent-color` (live), `contrast`.
  - Daraus wird das gpui-component-`Theme` mit den Adwaita-Werten aus 04 gebaut.
  - Schrift aus `org.gnome.desktop.interface font-name` über die Portal-Einstellungen, sonst Adwaita Sans. Textskalierung wird respektiert.
- **i18n:** `gettext-rs`, Textdomain `sheaf`, Sprache aus der Umgebung.
- **Tastatur:**

  | Kürzel | Wirkung |
  |---|---|
  | Strg+N | neue Notiz |
  | Strg+F oder einfach tippen in der Galerie | Suche |
  | Strg+K | Befehlspalette |
  | Strg+W, Esc im Editor | zurück zur Galerie |
  | Strg+, | Einstellungen |
  | Strg+? | Tastenkürzel |
  | Strg+Shift+N | Schnellnotiz |
  | Strg+P | anheften |
  | Entf in der Galerie | in den Papierkorb, mit Rückgängig-Toast |

## 6. Galerie (Startansicht)

```
┌ Kopfleiste ───────────────────────────────────────────────────────────┐
│ [Alle Notizen ▾]        [🔍 Suchen …                  ]      [+] [≡]  │
├───────────────────────────────────────────────────────────────────────┤
│ (Alle) (Arbeit) (Privat) (#rezepte) (Offene Aufgaben) …   ← Chips     │
│ Angeheftet                                                            │
│ ┌──────┐ ┌──────┐ ┌──────┐                                            │
│ │Vor-  │ │      │ │      │   Karten 200 px hoch, min. 200 px breit,  │
│ │schau │ │      │ │      │   Raster auto-fill, Abstand 16             │
│ └──────┘ └──────┘ └──────┘                                            │
│ Einkauf   Ausschreibung …                                             │
│ Heute · Arbeit                                                        │
│ Heute / Gestern / Letzte 7 Tage / Oktober 2026 …                      │
└───────────────────────────────────────────────────────────────────────┘
```

- **Ordnerauswahl** links in der Kopfleiste:
  - Ein Popover mit Ordnerbaum (Alle Notizen, Ordner verschachtelt, Intelligente Ordner, Zuletzt gelöscht).
  - Unten `Neuer Ordner` und `Neuer intelligenter Ordner` (aus der aktuellen Suche).
- **Chips** unter der Kopfleiste: Hauptordner, angeheftete Tags und intelligente Ordner, horizontal scrollbar.
- **Karten:**
  - Echte Miniatur des Inhalts: erste Zeilen gerendert, Checklisten mit Kreisen, erstes Bild als Titelbild, falls es oben steht.
  - Leiser Verlauf nach unten. Darunter Titel (13,5 px, 700) und `Datum · Ordner`.
  - Hover hebt die Karte um 2 px, mit Federkurve.
  - Rechtsklick: Anheften, Verschieben, Duplizieren, Exportieren, Löschen.
  - Mehrfachauswahl mit Strg/Shift.
- **Gruppen:** Angeheftet, Heute, Gestern, Letzte 7 Tage, Letzte 30 Tage, dann Monate. Sortierung im Menü: bearbeitet, erstellt, Titel.
- **Ansichtsumschalter** im Menü: Galerie | Liste. Die Liste ist kompakt mit Zeilen wie Variante 1 des Prototyps.
- **Virtualisiert:** gpui-component `VirtualList` bzw. ein eigenes Raster. Miniaturen werden verzögert erzeugt und als Layout-Cache gehalten.
- **Leer:** „Noch keine Notizen“ und der Knopf `Neue Notiz`. Bei leerer Suche: „Keine Treffer für …“ plus Vorschlag ohne Filter.

## 7. Editor-Ansicht

- **Navigation:**
  - Die Notiz schiebt sich von rechts herein (Federkurve, 350 ms). Zurück per Knopf, Esc oder Wischgeste (Touchpad).
  - Die Galerie behält dabei die Scrollposition.
- **Kopfleiste:** `‹ Notizen` · Ordnername · rechts Anheften, Teilen/Export (Markdown-Datei, PDF, Drucken), Menü (Info: Wörter, erstellt, geändert, Pfad; Im Dateimanager zeigen; Verschieben; Löschen).
- **Inhalt:**
  - gpui-markdown-editor mit `first_line_is_title`, max. 700 px breit. Das Datum steht klein und zentriert über dem Titel.
  - `FormatBar` unten schwebend, `SlashMenu` auf `/`.
- **Extras von Sheaf:**
  - Autovervollständigung für `[[` (Notiztitel) und `#` (bekannte Tags).
  - Rückverweise ganz unten, eingeklappt: „3 Notizen verweisen hierher“.
  - Bilder einfügen kopiert die Datei nach `_attachments/<id>/`.
- **Speichern:**
  - Entprellt 600 ms nach der letzten Änderung und sofort beim Verlassen.
  - Atomar: in eine temporäre Datei schreiben, dann umbenennen.
  - Kein Speichern-Knopf. Unten steht leise „Gespeichert“.

## 8. Schnellnotiz

- Ein kleines eigenes Fenster (380×300, Radius 14) mit nur Editor und Fußzeile: `Ordner ▾` · `Öffnen` · `Fertig`.
- **Öffnen über:**
  - `sheaf --quick`
  - D-Bus `QuickNote()`
  - Visor (Befehl `notiz` ohne Text, Dock-Ansicht)
  - Tastenkürzel: Visor bietet es in seinen Einstellungen an. Ohne Visor über das GlobalShortcuts-Portal, solange die App läuft *(prüfen)*. Sonst steht eine Anleitung in den Einstellungen.
- Neue Schnellnotizen landen im Ordner „Schnellnotizen“. Die letzte Schnellnotiz wird innerhalb von 5 min fortgesetzt, statt eine neue zu öffnen (einstellbar).

## 9. Weitere Funktionen 1.0

- **Intelligente Ordner:** gespeicherte Suche (Abschnitt 3) mit Name und Symbol, in `config.toml`.
- **Vorlagen:** `.sheaf/templates/*.md`. Auswahl über `+ ▾` und `/vorlage`. Variablen `{{date}}`, `{{time}}`, `{{title}}`.
- **Papierkorb:** „Zuletzt gelöscht“ mit Wiederherstellen und Endgültig löschen.
- **Export:** Markdown-Kopie, PDF (über den Druckdialog des Portals *(prüfen)*, sonst HTML → PDF mit einer schlanken Rust-Crate), Drucken.
- **Einstellungen** (eigenes Fenster in der App): Notizordner, Sortierung, Schnellnotiz-Verhalten, Schrift (System, Serif, Mono), Zeilenbreite, Tastenkürzel.
- **CLI**: siehe Abschnitt 9a.

## 9a. CLI (für Skripte, andere Tools und KI-Agenten)

- **Ein Binary.** `sheaf` ohne Unterbefehl öffnet die App. Mit Unterbefehl läuft es ohne Fenster und ohne GPU:
  - Es spricht mit `sheaf-searchd` über D-Bus.
  - Läuft der Dienst nicht, arbeitet es direkt mit `sheaf-core`.
  - Gebaut mit `clap`, Shell-Vervollständigung für bash, zsh und fish wird mitinstalliert.
- **Befehle:**

  | Befehl | Wirkung |
  |---|---|
  | `sheaf new [TEXT] [--folder F] [--template T] [--tag X]…` | Text kommt aus dem Argument oder von stdin. Gibt die ID aus |
  | `sheaf append <ID\|TITEL> [TEXT]` · `sheaf prepend …` | Anhängen / Voranstellen, Text auch von stdin |
  | `sheaf show <ID\|TITEL> [--format md\|json\|text]` | Inhalt ausgeben |
  | `sheaf edit <ID>` | öffnet `$EDITOR` |
  | `sheaf search <QUERY> [--limit N] [--json]` | gleiche Suchsprache wie in der App, inklusive `#tag` und `hat:` |
  | `sheaf list [--folder F] [--tag X] [--pinned] [--modified-since DATUM] [--json]` | Notizen auflisten |
  | `sheaf tasks [--open] [--json]` | alle Checklisten-Punkte über alle Notizen |
  | `sheaf check <ID> <PUNKT-NR\|TEXT>` · `sheaf uncheck …` | Punkt abhaken / zurücksetzen |
  | `sheaf tags` · `sheaf folders` | Tags und Ordner auflisten |
  | `sheaf mv <ID> <ORDNER>` · `sheaf rm <ID>` · `sheaf restore <ID>` · `sheaf pin <ID>` · `sheaf unpin <ID>` | verschieben, Papierkorb, wiederherstellen, anheften |
  | `sheaf open <ID>` · `sheaf quick` · `sheaf reindex` · `sheaf path` | in der App öffnen, Schnellnotiz, neu indexieren, Notizordner ausgeben |

- **Für KI und Automatisierung gemacht:**
  - `--json` gibt es bei jedem Befehl, mit stabilem, versioniertem Schema (`"schema": 1`). Die Schemas liegen in `docs/cli-schema/`.
  - Fehler kommen als JSON auf stderr (`{"error": {"code": "not_found", "message": …}}`), dazu feste Exit-Codes: 0 ok, 1 Fehler, 2 Nutzung, 3 nicht gefunden, 4 mehrdeutig. Bei mehrdeutigem Titel kommen die Kandidaten mit.
  - Notizen lassen sich per ID, exaktem Titel oder eindeutigem Titelanfang ansprechen.
  - Es gibt keine interaktiven Rückfragen. `rm` landet ohnehin im Papierkorb.
  - `sheaf help --json` beschreibt alle Befehle maschinenlesbar.
  - Mitgeliefert wird `docs/AGENTS.md`, eine kurze Anleitung für KI-Agenten (Claude Code, T3 Code), wie sie Notizen per CLI lesen und schreiben. Dazu ein fertiger Skill-Ordner `skills/sheaf-notes/SKILL.md` zum Kopieren.
- **Tests:** jeder Befehl mit Snapshot-Tests der JSON-Ausgabe (`insta`, `assert_cmd`) gegen einen temporären Notizordner.

## 10. Visor-Modul „Visor: Notizen“ (`visor-module/`)

- Eine eigene GNOME-Extension `sheaf-visor@taulit.github.io`. Sie wird über `connectVisor()` aus dem Visor-SDK angebunden. Slot **dock**, Symbol `notes-symbolic`.
- **Dock-Ansicht:**
  - Oben ein Eingabefeld „Neue Notiz …“: Enter ruft `Create`. Strg+Enter erstellt die Notiz und öffnet sie in der App.
  - Darunter „Zuletzt“: 6 Notizen mit Titel, Ausschnitt und Zeit. Klick öffnet sie in der App.
  - Unten `In Notizen öffnen` und `Schnellnotiz`.
  - Aussehen wie `notesView()` im Visor-Prototyp, aber ohne eingebetteten Editor. Bearbeitet wird in der App.
- **Suche:** `search` liefert Notizen über `Search()`. `replacesSearchProvider` blendet den Remote-Anbieter von Sheaf aus, damit nichts doppelt erscheint.
- **Befehl:** `notiz <text>` / `note <text>` legt eine Notiz an. Toast: „In Schnellnotizen gespeichert“.
- **Ohne Sheaf:** Das Modul zeigt „Notizen ist nicht installiert“ mit einem Link zu Flathub.

## 11. Pakete

- **Flatpak:**
  - Runtime `org.freedesktop.Platform` 25.08 + Rust-SDK-Erweiterung. Für Vulkan gibt es GL-Erweiterungen, Software-Fallback über Mesa.
  - Berechtigungen: `--socket=wayland --socket=fallback-x11 --device=dri --filesystem=xdg-documents --talk-name=org.freedesktop.portal.*`.
  - Andere Notizordner per Override (dokumentiert, Flatseal).
  - Exportiert: Desktop-Datei, Symbole, metainfo, D-Bus-Services, `search-provider.ini`.
- **AUR:** `sheaf` (aus Release-Tarball) und `sheaf-git`, ohne Sandbox. Der Ordner ist dort frei wählbar.
- **Visor-Modul:** eigene Store-ZIP aus `visor-module/`.
