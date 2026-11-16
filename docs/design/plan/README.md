# Visor, Sheaf, gpui-markdown-editor: Gesamtplan

Stand 16.11.2026. Dieser Ordner ist die einzige Quelle für die Umsetzung. Sie läuft in **drei parallelen Sessions** (Fable mit Sub-Agents), dazu kommt später eine vierte für den Modul-Katalog.

| Datei | Inhalt |
|---|---|
| [README.md](README.md) | Ziel, Entscheidungen, Sessions, Arbeitsweise, Startprompts |
| [01-visor.md](01-visor.md) | Shell-Extension Visor: Aufbau, Modul-API, Module, Suche, Katalog, Website |
| [02-gpui-markdown-editor.md](02-gpui-markdown-editor.md) | Rust-Crate: WYSIWYG-Markdown-Editor für GPUI |
| [03-sheaf.md](03-sheaf.md) | Notizen-App Sheaf: Speicherung, Suche, Oberfläche, CLI, Visor-Modul |
| [04-design.md](04-design.md) | Design-Tokens, Maße, Bewegung, alle Oberflächen |
| [05-quality-release.md](05-quality-release.md) | Tests, Leistungsbudgets, Reviews, Pakete, SEO, Veröffentlichung |

Referenzen im Ordner darüber (`~/.t3/scratch/2026-11-16-https-apps-microsoft-com-detail-2f7c8035/`):
- `prototype-gnome-island-v4.html?variant=1`: das verbindliche Aussehen von Visor.
- `prototype-notes-app.html?variant=3`: das verbindliche Aussehen von Sheaf.
- `ENTSCHEIDUNG.md`: Designregeln von Visor.
- `NOTIZEN-FEATURES.md`: der Funktionsumfang von Sheaf.

Jede Session kopiert die Prototypen und diese Pläne nach `docs/design/` ihres Repos.

## Ziel

1. **Visor**: Ersetzt das Datum- und Mitteilungsmenü in der Mitte der GNOME-Leiste durch eine Notch.
   - Sie wächst unter der Leiste heraus und zeigt nur, was gerade passiert.
   - Sie ist modular. Jeder kann Module bauen.
   - Ein geprüfter Katalog mit Suche zeigt, was es gibt.
2. **Sheaf**: eine Notizen-App auf dem Niveau von Apple Notizen.
   - Normale Markdown-Dateien, sehr gute Suche.
   - Eine CLI für Skripte und KI.
   - In GNOME heißt sie nur „Notizen“.
3. **gpui-markdown-editor**: der Editor von Sheaf als eigenständige Open-Source-Crate für alle GPUI-Apps, später als Vorschlag für gpui-component.

## Feste Entscheidungen

| Thema | Entscheidung |
|---|---|
| GitHub | Org **taulit**: `taulit/visor`, `taulit/visor-module-template`, `taulit/visor-modules` (Katalog), `taulit/sheaf`, `taulit/gpui-markdown-editor`. Weitere Module je ein Repo `visor-<name>`. Bis zur Freigabe privat |
| Kennungen | Visor-UUID `visor@taulit.github.io`, Sheaf-App-ID `io.github.taulit.Sheaf`, npm `@taulit/visor-module`, Website `taulit.github.io/visor` |
| Name | **Visor** – „Dynamic Island & Notch for GNOME“. **Sheaf** wird angezeigt als „Notizen“ / „Notes“ |
| Visor-Technik | GJS mit St und Clutter. TypeScript, übersetzt mit `tsc` zu lesbarem ESM, ohne Bundler. Kein eigener Daemon (der Store verbietet mitgelieferte Programme) |
| Sheaf-Technik | Rust, GPUI über `gpui-component`, tantivy, zbus, ashpd |
| GPUI-Version | Die `gpui-pre`-Version, die gpui-component festlegt (Stand `=0.3.12` mit gpui-component 0.10.0). **Der Editor ist die Quelle der Wahrheit.** Sheaf übernimmt genau dessen Versionen |
| Speicher | Markdown-Ordner lokal. Sync macht der Nutzer selbst |
| Lizenzen | Visor GPL-2.0-or-later, Sheaf GPL-3.0-or-later, Editor Apache-2.0, Modul-Vorlage MIT (damit jeder sie frei nutzen kann) |
| Code | Alles auf Englisch: Code, Kommentare, Commits (Conventional Commits), READMEs, Doku. Übliche Konventionen der Sprache (rustfmt/clippy, eslint/prettier, GJS-Stil laut gjs.guide). Kommentare nur, wo das Warum nicht offensichtlich ist |
| Sprachen der Oberfläche | Infrastruktur ab Tag 1: gettext, `.pot`-Datei per Skript erzeugt. Siehe Abschnitt „Übersetzungen“ |

Bewusst **nicht** Teil des Projekts:
- Schnelleinstellungen, Zwischenablage, Monatskalender, Weltuhren, feste Notizen-Kachel in Visor.
- Eigener Sync, Zusammenarbeit, Zeichnen, Scannen in Sheaf.
- Electron oder Webview.

## Wie die Teile zusammenspielen

```
GNOME Shell
└── Visor-Extension (GJS, St/Clutter)
    ├── eingebaute Module: Medien, Timer, T3 Code, Downloads, Als Nächstes, Mitteilungen
    ├── Suche: Apps, Rechner, Währung, Befehle, GNOME-Suchanbieter
    └── Modul-API ◄── fremde Module = eigene GNOME-Extensions (z. B. „Visor: Notizen“)
                       gefunden über den geprüften Katalog (taulit/visor-modules → catalog.json)

Sheaf
├── sheaf          GPUI-App + CLI (ein Binary)
├── sheaf-searchd  D-Bus-Dienst ohne Fenster: Index, SearchProvider2, io.github.taulit.Sheaf1
└── visor-module/  „Visor: Notizen“

gpui-markdown-editor ──► von Sheaf als Abhängigkeit benutzt
T3 Code (lokaler Server) ◄── WebSocket ── Visor-Modul „T3 Code“
```

## Sessions

Drei Sessions starten gleichzeitig. Sie arbeiten in getrennten Repos und stimmen sich nur über **feste Schnittstellen und Git-Tags** ab, nicht über Nachrichten.

| Session | Repo(s) | Inhalt | Liefert an andere |
|---|---|---|---|
| **1 Visor** | `taulit/visor`, `taulit/visor-module-template` | 01 Abschnitte 1–10a, 04, 05 (Visor-Teile) | Tag `api-v1` + `docs/api-v1.md`, sobald die Modul-API steht (nach V2) |
| **2 Editor** | `taulit/gpui-markdown-editor` | 02, 04 (Editor-Teile), 05 | Tag `v0.0.1-api` gleich zu Beginn (öffentliche API kompiliert, Funktionen noch einfach), danach `v0.1.0` |
| **3 Sheaf** | `taulit/sheaf` | 03, 04 (Sheaf-Teile), 05, NOTIZEN-FEATURES.md | – |
| **4 Katalog** (später) | `taulit/visor-modules`, `taulit/visor` (nur `site/`) | 01 Abschnitt 11 | Website und Katalog |

**Warum der Editor eine eigene Session bekommt:** Er ist allgemein, hat keine Sheaf-Abhängigkeit, und seine Arbeit (Textmodell, Eingabe, IME, Tabellen) ist der schwierigste Einzelblock. Getrennt bleibt sein Kontext klein und die Sheaf-Session kommt parallel voran.

**Abhängigkeiten zwischen den Sessions:**
- **Sheaf → Editor:**
  - Sheaf bindet den Editor als Git-Abhängigkeit auf einen Tag ein (`tag = "v0.0.1-api"`, später neuere).
  - Bis die echten Funktionen da sind, arbeitet Sheaf gegen die fertige API mit einfacher Implementierung.
  - Die API-Skizze in 02 ist der Vertrag. Ändert die Editor-Session die API, setzt sie einen neuen Tag und vermerkt die Änderung in `CHANGELOG.md`.
- **Sheaf → Visor:**
  - Das Modul „Visor: Notizen“ baut Sheaf erst, wenn Visor den Tag `api-v1` hat. Die Sheaf-Session prüft das mit `gh api repos/taulit/visor/git/refs/tags/api-v1`, wenn sie dort ankommt, ohne vorher zu warten oder zu pollen.
  - Fehlt der Tag noch, wird das Modul in Session 4 gebaut.
- **Session 4** startet, wenn Visor `api-v1` hat. Sie kann eine neue Session sein (empfohlen, weil der Kontext frisch und günstig ist) oder die Visor-Session macht weiter, falls deren Kontext noch klein ist.
- **Stand jeder Session** steht in `docs/STATUS.md` ihres Repos: fertig, offen, aktuelle Tags. Andere Sessions lesen nur diese Datei.

### Phasen je Session

Am Ende jeder Phase steht ein **Tor**. Erst bei grünem Tor geht es weiter.

**Session 1 · Visor**

| Phase | Inhalt | Tor |
|---|---|---|
| V0 | Werkzeuge prüfen, Repo, CI-Gerüst, `docs/verified.md` (alle *(prüfen)*-Punkte aus 01 und 05), headless Shell + Screenshot-Skript | Screenshot der headless Shell |
| V1 | Kern: Einbau in die Leiste, Zustände, Feder, Theme, Uhr, Tastenkürzel, Registry, Kit, leeres Sheet (01 §2–5) | Screenshots idle/hint/peek/open hell+dunkel, 50× enable/disable sauber |
| V2 | Module: Mitteilungen, Als Nächstes, Medien, Timer, Downloads. Suche (01 §6.1, 6.3–6.6, 7). API einfrieren → Tag `api-v1` | Szenarien 1, 2, 4, 8 aus 05 |
| V3 | T3 Code (Protokoll, Mock, Modul), Peek-Chips, Einstellungen, SDK, `visor-module-template` (01 §6.2, 8–10a) | Szenario 3, Vorlage baut eine Store-ZIP |
| V4 | Härten: Budgets, Barrierefreiheit, Übersetzungen, Reviews, EGO-Checkliste, Pakete, README | Alles aus 05 für Visor grün |

**Session 2 · Editor**

| Phase | Inhalt | Tor |
|---|---|---|
| E0 | Werkzeuge, Repo, CI, gpui-pre-Version festlegen, *(prüfen)*-Punkte (IME, AccessKit) | – |
| E1 | Öffentliche API vollständig als Gerüst + Dokumentmodell + verlustfreies Lesen/Schreiben → Tag `v0.0.1-api` (02 §1–4) | Round-Trip-Korpus 100 % |
| E2 | Darstellung, Cursor, Eingabe, IME, Marks, Listen, Checklisten, Eingaberegeln, Kürzel (02 §5–7) | Beispiel-App bearbeitbar, Interaktionstests |
| E3 | Tabellen, Bilder, Einfügen, Ziehen, Slash-Menü, FormatBar, Suche, Einklappen, Erweiterungen (02 §8–11) | Alle Funktionen in `examples/notes.rs` |
| E4 | Benchmarks, Doku, README mit GIF, Reviews → Tag `v0.1.0` | Budgets aus 05 |

**Session 3 · Sheaf**

| Phase | Inhalt | Tor |
|---|---|---|
| S0 | Werkzeuge, Repo, CI, *(prüfen)*-Punkte aus 03 (Portale, GlobalShortcuts, Flatpak-Suchanbieter) | – |
| S1 | `sheaf-core` + `sheaf-searchd` + CLI (03 §1–4, 9a) | Suche p95 < 30 ms bei 10.000 Notizen, GNOME-Suche findet Notizen, CLI-Snapshot-Tests |
| S2 | App: Fenster, Theme, Galerie, Filter, Suche, Navigation, Editor-Ansicht mit Editor-API (03 §5–7) | Galerie flüssig, Notiz bearbeiten und speichern |
| S3 | Schnellnotiz, Papierkorb, intelligente Ordner, Vorlagen, Rückverweise, Anhänge, Export, Einstellungen (03 §8–9). Visor-Modul, falls `api-v1` da ist (03 §10) | Alle „1.0“-Punkte aus NOTIZEN-FEATURES.md |
| S4 | Budgets, Übersetzungen, Reviews, Flatpak, AUR, metainfo, README | Alles aus 05 für Sheaf grün |

**Session 4 · Katalog** (nach `api-v1`)

| Phase | Inhalt |
|---|---|
| K1 | `taulit/visor-modules`: Schema, Issue-Formular, PR-Vorlage, REVIEW.md, CODEOWNERS, Branch-Schutz, ein Workflow für `catalog.json` (01 §11.1–11.2). Weitere Automatik nur notieren |
| K2 | Stack festlegen (Empfehlung Astro, 01 §11.4), `catalog-search.ts`, Website mit Karten-Übersicht mit Bildern, Suche, Modulseiten, SEO. „Entdecken“ in den Visor-Einstellungen mit denselben Karten. Einträge für eingebaute Module und „Visor: Notizen“ mit echten Screenshots |
| K3 | Falls noch offen: „Visor: Notizen“ aus 03 §10 |

## Arbeitsweise: zügig und sparsam

Für alle Sessions verbindlich:

1. **Sub-Agents gezielt einsetzen.**
   - Pro Session höchstens 2–3 gleichzeitig, jeder mit klarem Auftrag: welche Dateien, welcher Abschnitt des Plans, welche Abnahme.
   - Nicht den ganzen Plan mitgeben, nur den nötigen Abschnitt.
   - Der Orchestrator schreibt selbst wenig Code. Er verteilt, prüft Tore und hält `docs/STATUS.md` aktuell.
2. **Mechanisches an kleinere Modelle:** Übersetzungen, Paketdateien, README-Tabellen, CI-YAML. Das können Sonnet- oder Haiku-Sub-Agents. Architektur, Editor-Kern, Shell-Integration und Reviews bleiben bei Fable.
3. **Tests nach Blöcken, nicht nach jeder Änderung.**
   - Tests werden zusammen mit dem Code geschrieben.
   - Während der Arbeit laufen nur die direkt betroffenen Tests (`cargo test -p <crate> <name>`, `vitest run <datei>`). Beim Iterieren reicht `cargo check`.
   - Die volle Suite, Screenshots und Benchmarks laufen **einmal pro Tor**. Danach wird gesammelt behoben und einmal erneut geprüft.
   - Kein Watch-Modus, keine Release-Builds außer für Benchmarks.
4. **Reviews sparsam.** Ein `bug-review` pro Tor ab Phase 2. `simplicity-review` und `spec-review` nur einmal in Phase 4. Jeweils ein frischer Agent, Funde gesammelt beheben.
5. **Recherche nur einmal.** Die *(prüfen)*-Punkte werden in Phase 0 geklärt und in `docs/verified.md` festgehalten. Danach wird nicht neu recherchiert, sondern nachgeschlagen.
6. **CI schlank.** Läuft bei Push auf main und bei PRs, nächtliche Jobs erst ab Phase 4. Lokale Prüfung vor dem Push, damit die CI nicht als Testschleife dient.
7. **Kein Warten und Pollen.** Abhängigkeiten zu anderen Sessions werden einmal geprüft, wenn man dort ankommt. Ist etwas noch nicht da, macht die Session mit anderem weiter und vermerkt es in STATUS.md.
8. **Wenige große PRs, die der Nutzer prüft.** Siehe Abschnitt „Pull Requests“.

## Pull Requests

Der Nutzer prüft **nur einen PR pro Phase**, nicht jede Teilaufgabe.

- **Branches:**
  - Pro Phase ein Branch `phase/<id>-<kurzname>`, z. B. `phase/v1-core`.
  - Sub-Agents arbeiten auf eigenen Branches oder Worktrees. Die Session merged deren Arbeit selbst in den Phasen-Branch, ohne den Nutzer.
  - Kleine Commits, Conventional Commits.
- **Wann ein PR auf main geöffnet wird:** Erst wenn das Tor der Phase grün ist, also volle Tests, Lint und Budgets der Phase bestanden. Ablauf nach dem Skill `implement-pr` bzw. `file-pr`.
- **Was jeder PR enthält:**
  - Was die Phase liefert, bezogen auf die Plan-Abschnitte.
  - Wie getestet wurde, mit den Ergebnissen.
  - Bekannte Grenzen.
  - Was der Nutzer ausprobieren kann.
  - **Screenshots bzw. kurze Videos** jeder sichtbaren Änderung, hell und dunkel. Als Bilder im PR eingebettet.
  - Bei Leistungsänderungen die Messwerte.
- **Nicht warten:**
  - Die Session arbeitet nach dem PR sofort an der nächsten Phase weiter, auf einem Branch, der vom vorigen Phasen-Branch abzweigt.
  - Wird der vorige PR gemerged, rebased die Session.
  - Gibt es Review-Kommentare, behebt sie die Session im offenen PR (Skill `babysit-pr`, falls gewünscht).
  - Gemerged wird nur vom Nutzer.
- **Ausnahme:** Tags wie `v0.0.1-api` (Editor) und `api-v1` (Visor) darf die Session auf dem Phasen-Branch setzen, damit andere Sessions nicht warten müssen.

## Übersetzungen

- **Ab Start:** Englisch (Quelle) und Deutsch (vollständig, sorgfältig). Alle Texte laufen über gettext, kein Text fest im Code.
- **Vor der Veröffentlichung (Phase 4):** ein Sonnet-Sub-Agent übersetzt in die Sprachen mit den meisten Linux-Desktop-Nutzern und der aktivsten GNOME-Übersetzergemeinschaft: Spanisch, Französisch, Portugiesisch (Brasilien), Italienisch, Polnisch, Russisch, Chinesisch (vereinfacht), Japanisch. Die Feste-Begriffe-Tabelle aus 04 dient als Glossar. Diese Sprachen werden in der README als „maschinell übersetzt, Verbesserungen willkommen“ markiert.
- **Danach:** Hosted Weblate (kostenlos für Open Source) für Beiträge der Gemeinschaft. Eine neue Sprache ist dann nur noch eine `.po`-Datei.

## Was keine Session selbst tut

Diese Schritte bereitet jede Session vor und erledigt sie erst nach Rückfrage:
- Repos öffentlich schalten.
- Einreichen im Extension-Store. Der Nutzer muss den Code vertreten können, der Store lehnt Code ab, der nach KI aussieht.
- Einreichen bei Flathub.
- Veröffentlichen auf crates.io, npm und AUR. Die Tokens fragt die Session über `request_secret` an.
- Visor in die laufende Sitzung des Nutzers installieren. Das braucht Ab- und Anmelden.
- Echte T3-Code-Freigaben auslösen. Getestet wird nur gegen den Mock-Server, mit dem echten Server nur lesend.

## Startprompts

Alle Prompts beginnen mit demselben Kopf:

```
Plan: ~/.t3/scratch/2026-11-16-https-apps-microsoft-com-detail-2f7c8035/plan/
Lies README.md (vor allem „Sessions“ und „Arbeitsweise“) und die unten genannten Dateien.
Du bist Orchestrator dieser Session: arbeite deine Phasen ab, verteile Teilaufgaben an Sub-Agents
(höchstens 2–3 gleichzeitig, Mechanisches an Sonnet/Haiku), prüfe jedes Tor selbst.
Freigegeben: die unten genannten Repos privat in der GitHub-Org taulit anlegen, Branches, Commits
(Conventional Commits, alles auf Englisch), Pushes und PRs darin.
Nicht freigegeben: alles unter „Was keine Session selbst tut“.
Wenn eine Annahme mit (prüfen) falsch ist: Plan im Repo anpassen, in docs/verified.md begründen, weitermachen.
```

**Session 1 · Visor**

```
Deine Session: 1 Visor. Repos: taulit/visor, taulit/visor-module-template. Arbeitsordner ~/development/visor.
Dateien: 01-visor.md (ohne Abschnitt 11), 04-design.md, 05-quality-release.md, ../ENTSCHEIDUNG.md,
Prototyp ../prototype-gnome-island-v4.html?variant=1.
Setze nach Phase V2 den Tag api-v1 und schreibe docs/api-v1.md.
```

**Session 2 · Editor**

```
Deine Session: 2 Editor. Repo: taulit/gpui-markdown-editor. Arbeitsordner ~/development/gpui-markdown-editor.
Dateien: 02-gpui-markdown-editor.md, 04-design.md (Sheaf-Maße für den Editor), 05-quality-release.md,
Prototyp ../prototype-notes-app.html?variant=3 (Editor-Ansicht).
Setze den Tag v0.0.1-api, sobald die öffentliche API kompiliert und dokumentiert ist (Phase E1), so früh wie möglich.
```

**Session 3 · Sheaf**

```
Deine Session: 3 Sheaf. Repo: taulit/sheaf. Arbeitsordner ~/development/sheaf.
Dateien: 03-sheaf.md, 04-design.md, 05-quality-release.md, ../NOTIZEN-FEATURES.md,
Prototyp ../prototype-notes-app.html?variant=3.
Editor: Git-Abhängigkeit auf taulit/gpui-markdown-editor (neuester Tag, gpui-Versionen von dort übernehmen).
Visor-Modul (03 §10) nur, wenn taulit/visor den Tag api-v1 hat; sonst in STATUS.md als offen vermerken.
```

**Session 4 · Katalog** (wenn `api-v1` existiert)

```
Deine Session: 4 Katalog. Repos: taulit/visor-modules (neu), taulit/visor (nur site/ und src/core/catalog-search.ts).
Arbeitsordner ~/development/visor-modules und ~/development/visor.
Dateien: 01-visor.md Abschnitt 10–11, 04-design.md, 05-quality-release.md Abschnitt 7.
Lies zuerst docs/STATUS.md und docs/api-v1.md in taulit/visor. Danach Phasen K1–K3.
```
