# 05 · Qualität, Tests, Veröffentlichung

## 1. Leistungsbudgets (Pflicht, gemessen in Phase 4)

| Teil | Messgröße | Budget |
|---|---|---|
| Visor | `enable()` | < 5 ms |
| Visor | Zusatzspeicher der Shell nach 1 h Nutzung | < 15 MB |
| Visor | Wakeups im Leerlauf (nichts läuft, Panel zu) | 0 über 60 s |
| Visor | Öffnen und Schließen | 60 fps ohne Drop auf 60 Hz, Main-Loop-Arbeit pro Frame < 8 ms |
| Visor | Ergebnis der Suche (lokal: Apps, Rechnen) | < 16 ms nach dem Entprellen |
| Editor | Tastendruck bei 10.000 Zeilen | < 4 ms |
| Editor | 1 MB Markdown öffnen | < 50 ms |
| Sheaf | Kaltstart bis Galerie sichtbar | < 250 ms (1.000 Notizen) |
| Sheaf | Speicher mit 1.000 Notizen, Galerie offen | < 120 MB RSS |
| Sheaf | Suche p95, 10.000 Notizen | < 30 ms |
| Sheaf | Scrollen der Galerie | 60 fps |
| sheaf-searchd | Speicher im Leerlauf | < 15 MB |

**Messung:**
- Visor über einen Debug-Schalter (GSettings `debug-metrics`), der Frame-Zeiten und Zähler ins Journal schreibt, sowie `powertop`.
- Rust über `criterion` und ein Skript `scripts/measure.sh` (RSS über `/proc`, Startzeit über Zeitstempel im Log).
- Die Ergebnisse kommen nach `docs/performance.md` in jedes Repo.

## 2. Tests je Repo

### Visor

- **Reine Logik** mit Vitest unter Node, nur für Module ohne `gi://`-Imports:
  - Parser: Befehle, Zeiten, Währungen
  - Rechner (inklusive Fehlerfälle und Locale)
  - Ranking
  - Zeitformatierung
  - Peek-Priorität
  - Katalog-Suche (`catalog-search.ts`)
- **Shell-Tests:**
  - `scripts/nested.sh` startet eine headless Shell in einer Sandbox (eigenes HOME, eigene XDG-Ordner, eigener D-Bus): `dbus-run-session -- gnome-shell --headless --wayland --no-x11 --virtual-monitor 1920x1080` (bestätigt). Die Extension wird in die Sandbox kopiert und dort über GSettings aktiviert. So berührt kein Test die laufende Sitzung.
  - `scripts/shell-shot.sh <szenario>`:
    1. Setzt Zustände über die D-Bus-Schnittstelle `io.github.taulit.Visor.Debug` (`Eval`). Sie steckt in einer eigenen Test-Extension (`tests/shell-helper/`), die nur die Sandbox lädt. Visor selbst enthält keinen Debug-Code.
    2. Macht dann einen Screenshot über `Screenshot` derselben Schnittstelle (`org.gnome.Shell.Screenshot` lässt fremde Aufrufer nicht zu).
  - Szenarien: idle, hint, peek mit 4 Chips, open mit allen Modulen, open nur Ausblick, Suche mit Ergebnissen, Agent wartend aufgeklappt, Modulansicht, Notizen-Dock. Jeweils hell und dunkel und mit 2 Akzentfarben.
  - Screenshots landen in `docs/screenshots/`. Der Orchestrator vergleicht sie mit den Prototypen.
  - Leck-Test: 50× enable/disable. Danach muss gelten:
    - `Main.layoutManager.uiGroup` hat dieselbe Kinderzahl wie vorher.
    - Es gibt keine Journal-Warnungen.
    - Das Datumsmenü ist sichtbar.
- **T3:** Tests gegen `tests/t3-mock` für Verbinden, wartende Freigabe, Erlauben, Ablehnen, Antworten, Stoppen, Server weg und wieder da.
- **Lint:** `eslint` mit GJS-Regeln (Konfiguration aus gjs.guide), `tsc --noEmit` strict, `prettier --check`.

### gpui-markdown-editor

Siehe 02, Abschnitt 12. Dazu `cargo fmt --check`, `clippy -D warnings`, `cargo deny`, `cargo doc` ohne Warnungen, und `cargo semver-checks` ab 0.1.

### Sheaf

- **`sheaf-core`:**
  - Speichern, Umbenennen, Kollisionen
  - Frontmatter minimal (unverändert bleibt unverändert)
  - Papierkorb mit Ablauf
  - externe Änderungen und Konflikte
  - Index und Suchsprache: Tabellentests für Tippfehler, Umlaute, Präfixe, Filter, Phrasen, Gewichtung
- **Benchmark:** 10.000 erzeugte Notizen (deutsch und englisch gemischt, mit Checklisten, Tabellen, Tags).
- **D-Bus:** Integrationstest mit `dbus-run-session`, die alle Methoden beider Schnittstellen aufruft.
- **UI:** `gpui::TestAppContext` für Galerie-Filter, Navigation, Schnellnotiz, Speichern beim Verlassen. Screenshots der App in der headless Shell, wie bei Visor, hell und dunkel.
- **Visor-Modul:** dieselben Shell-Szenarien mit Sheaf aus dem Debug-Build.

## 3. Ende-zu-Ende-Szenarien (Tor 3)

1. **Mitteilung:** Panel zu → Mitteilung kommt → Peek 3 s → Klick → Panel offen, Mitteilung oben → Klick → App öffnet sich.
2. **Timer:** `timer 1m Test` in der Suche → Zeile in Jetzt → nach 1 min Mitteilung mit Ton und Zeile „Fertig“.
3. **Agent:** Mock-Agent wartet → Punkt im Hals bernstein → Peek → Erlauben → Mock erhält die Freigabe → Zeile „läuft“.
4. **Rechnen:** `100 usd in eur` → Ergebnis mit Kurs vom Tag → Enter kopiert.
5. **Notiz anlegen:** `notiz Milch kaufen` → Toast → Sheaf-Galerie zeigt die Notiz in „Schnellnotizen“ → GNOME-Übersicht findet „Milch“ unter „Notizen“.
6. **Externe Änderung:** In Sheaf eine Checkliste anlegen, extern mit `sed` ändern → offene Notiz lädt still neu.
7. **Modul entdecken:** Einstellungen → Module → Entdecken zeigt den Katalog, Suche filtert → Installieren löst den Dialog der Shell aus. Im Test wird bis zum Dialog geprüft, ohne Installation.
8. **Ausschalten:** Visor deaktivieren → originales Datumsmenü mit Kalender und Mitteilungen funktioniert unverändert.

## 4. Reviews

- **Pro Repo und Phase:** ein frischer Agent mit `bug-review` auf dem Diff der Phase. Ab Phase 3 zusätzlich `simplicity-review` und `spec-review` gegen diese Pläne.
- **Funde** werden behoben, dann prüft ein neuer Agent erneut, bis keine Funde mit Schwere „blockierend“ übrig sind.
- **Vor dem Extension-Store** eine eigene Prüfung gegen die Review-Richtlinien von gjs.guide. Die ganze Checkliste kommt nach `docs/ego-checklist.md`:
  - Keine Arbeit vor `enable()`. Alles in `disable()` zurückgebaut.
  - Keine mitgelieferten Programme, kein `eval`, keine fremden Laufzeit-Bibliotheken.
  - Netzwerkzugriffe (EZB-Kurse, Katalog, T3 lokal) dokumentiert und abschaltbar.
  - Kein toter Code, keine auskommentierten Blöcke, keine Kommentare, die wie Anweisungen an eine KI klingen. Einheitlicher Stil.
  - Jede benutzte Shell-API in der Quelle von GNOME Shell 50 nachgewiesen (Datei und Zeile in der Checkliste).
- **Hinweis für den Nutzer:** Der Store lehnt Code ab, der nach KI aussieht. Vor dem Einreichen soll der Nutzer den Code durchsehen und verstehen. Deshalb ist Visor bewusst klein gehalten.

## 5. CI (GitHub Actions)

| Repo | Jobs |
|---|---|
| visor | lint + typecheck + vitest. Build der Store-ZIP (`gnome-extensions pack`) als Artefakt. Prüfung `glib-compile-schemas --strict`. Prüfung, dass die README-Modultabelle aktuell ist. Site-Build und Deploy auf GitHub Pages (main). Nächtlich: Shell-Screenshot-Test in einem Fedora-Container mit GNOME 50 |
| gpui-markdown-editor | fmt, clippy, test, doc, deny auf Linux. Build auf macOS und Windows (nur Kompilieren, GPUI ist plattformübergreifend). Benchmarks nächtlich mit Vergleich |
| sheaf | fmt, clippy, test, deny. Benchmark der Suche (schlägt fehl über Budget). `flatpak-builder` mit Artefakt. Store-ZIP des Visor-Moduls. `appstreamcli validate`, `desktop-file-validate` |

**Releases** über Tags `vX.Y.Z` mit Release-Notes aus Conventional Commits (`git-cliff`):
- visor: Store-ZIP + npm-SDK
- editor: crates.io
- sheaf: Tarball, Flatpak-Bundle, Store-ZIP des Moduls

## 6. Pakete

| Was | Kanal | Datei |
|---|---|---|
| Visor | extensions.gnome.org, AUR `gnome-shell-extension-visor` | `visor@taulit.github.io.shell-extension.zip`, `build-aux/aur/PKGBUILD` |
| Visor-SDK | npm `@taulit/visor-module` | `sdk/package.json` |
| Sheaf | Flathub `io.github.taulit.Sheaf`, AUR `sheaf`, `sheaf-git` | `build-aux/flatpak/io.github.taulit.Sheaf.yml` (inklusive `cargo-sources.json` über flatpak-cargo-generator) |
| Visor: Notizen | extensions.gnome.org | `sheaf-visor@taulit.github.io.shell-extension.zip` |
| Editor | crates.io `gpui-markdown-editor` | `Cargo.toml` |

**Für Flathub vorbereiten:** metainfo mit Screenshots (über Raw-URLs aus dem Repo), Release-Einträgen, Content-Rating (OARS) und Markenfarben (`branding`).

## 7. Auffindbarkeit (SEO)

- **GitHub-Beschreibungen** (Name + was + wo):
  - visor: „Visor – a Dynamic Island / notch for GNOME Shell: media, timers, AI agent approvals, calendar and notifications in one calm panel. Modular.“
  - sheaf: „Notes for GNOME – fast native Apple Notes–style app with plain Markdown files, gallery view and powerful search. Rust + GPUI.“
  - gpui-markdown-editor: „WYSIWYG Markdown editor component for GPUI (Zed's UI framework) – lossless round-trip, tables, checklists, images.“
- **Topics:**
  - visor: `gnome`, `gnome-shell-extension`, `dynamic-island`, `notch`, `linux`, `wayland`, `typescript`
  - sheaf: `notes`, `markdown`, `gnome`, `gpui`, `rust`, `apple-notes`, `note-taking`, `linux`
  - editor: siehe 02
- **README-Aufbau:**
  1. Titel + Untertitel
  2. GIF
  3. drei Sätze Nutzen
  4. Installieren (Store-Knopf bzw. Flathub-Badge)
  5. Funktionen
  6. Module (Visor)
  7. Bauen
  8. Mitmachen
  9. Lizenz
- **Website** (Visor) mit sauberer Seitenstruktur, siehe 01, Abschnitt 11. Querverweise zwischen den drei Repos (Sheaf ↔ Visor-Modul, Sheaf ↔ Editor) in READMEs und Website.
- **Social Preview:** Bild je Repo (1280×640) aus den Screenshots erzeugt.

## 8. Abschlussbericht (`docs/release-checklist.md` je Repo)

Der Bericht listet:
- was erledigt und gemessen ist (mit Zahlen)
- was der Nutzer selbst tun muss: Repo öffentlich, Store-Upload, Flathub-PR, Tokens für crates.io, npm und AUR, Visor lokal installieren und neu anmelden
- offene Punkte mit Begründung
