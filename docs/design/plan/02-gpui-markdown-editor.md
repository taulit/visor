# 02 · gpui-markdown-editor (Rust-Crate)

Repo `taulit/gpui-markdown-editor` · crates.io `gpui-markdown-editor` · Lizenz Apache-2.0 · Untertitel: „WYSIWYG Markdown editor component for GPUI (Zed's UI framework)“

Ein Editor für formatierten Text, der Markdown liest und schreibt. Er ist an den Konzepten von Tiptap und ProseMirror orientiert (Schema, Transaktionen, Eingaberegeln, Erweiterungen), aber in idiomatischem Rust und für GPUI gebaut. Sheaf ist der erste Nutzer. Die Crate weiß nichts von Sheaf.

## 0. Ziele und Nicht-Ziele

**Ziele:**
- Markdown verlustfrei: Öffnen und Speichern ohne Änderung ergibt byte-identische Dateien. Unbekanntes bleibt als Rohblock erhalten.
- Fühlt sich an wie Apple Notizen oder Notion: sofortige Formatierung, keine sichtbaren `**`.
- Schnell: Tippen < 4 ms pro Tastendruck bei 10.000 Zeilen, Öffnen von 1 MB Markdown < 50 ms.
- Funktioniert mit IME (Akzente, CJK) und Wayland.
- Passt zu gpui-component: nutzt dessen `Theme`, Popover, Menüs und Highlighter.

**Nicht-Ziele:** Zusammenarbeit in Echtzeit (CRDT), HTML als Speicherformat, Plugins zur Laufzeit.

## 1. Abhängigkeiten

- `gpui` und `gpui-component` genau in der Version, die gpui-component festlegt (`gpui-pre =0.3.12` mit gpui-component 0.10.0, prüfen und mitziehen).
- `pulldown-cmark` (mit `offset_iter`, GFM-Optionen), `unicode-segmentation`, `smallvec`.
- Optional `html5ever` für das Einfügen von HTML (Feature `paste-html`, standardmäßig an).
- Keine weiteren schweren Abhängigkeiten. `cargo deny` prüft die Lizenzen.

## 1a. Öffentliche API (Vertrag mit Sheaf)

Diese Oberfläche wird in Phase E1 vollständig als kompilierendes Gerüst mit Doku geliefert (Tag `v0.0.1-api`). Sheaf programmiert gegen sie. Änderungen nur mit neuem Tag und Eintrag im CHANGELOG.

```rust
pub struct MarkdownEditor;                       // gpui Entity, impl Render + Focusable
impl MarkdownEditor {
    pub fn new(window: &mut Window, cx: &mut Context<Self>, options: EditorOptions) -> Self;
    pub fn set_markdown(&mut self, md: &str, cx: &mut Context<Self>);   // ersetzt Inhalt, leert Verlauf
    pub fn markdown(&self) -> String;                                    // verlustfrei serialisiert
    pub fn is_dirty(&self) -> bool;  pub fn mark_saved(&mut self);
    pub fn command(&mut self, cmd: Command, window: &mut Window, cx: &mut Context<Self>);  // alle Befehle aus §3
    pub fn find(&self, query: &str) -> Vec<TextRange>;
    pub fn highlight(&mut self, ranges: Vec<TextRange>, cx: &mut Context<Self>);
    pub fn scroll_to(&mut self, range: TextRange, cx: &mut Context<Self>);
    pub fn set_style(&mut self, style: EditorStyle, cx: &mut Context<Self>);
    pub fn word_count(&self) -> usize;
    pub fn meta(&self) -> &DocMeta;  pub fn set_meta(&mut self, meta: DocMeta, cx: &mut Context<Self>); // Spaltenbreiten, eingeklappte Überschriften
}
impl EventEmitter<EditorEvent> for MarkdownEditor {}
pub enum EditorEvent { Changed, SelectionChanged, MetaChanged, LinkClicked(String), WikiLinkClicked(String), TagClicked(String), AttachmentClicked(String) }

pub struct EditorOptions {
    pub first_line_is_title: bool,
    pub max_width: Option<Pixels>,
    pub extensions: Vec<Box<dyn Extension>>,               // WikiLink, Tag, Highlight mitgeliefert
    pub resolve_src: Option<Arc<dyn Fn(&str) -> Option<PathBuf>>>,
    pub on_image: Option<Arc<dyn Fn(Vec<u8>, &str /*mime*/) -> Option<String /*src*/>>>,
    pub completions: Option<Arc<dyn Fn(CompletionKind, &str) -> Vec<Completion>>>, // für [[ und #
    pub slash_items: Vec<SlashItem>,                       // zusätzliche Einträge des Hosts
    pub ui: UiParts,                                       // format_bar, slash_menu, find_bar, link_popover an/aus
}
```

## 2. Dokumentmodell

```rust
pub struct Document { blocks: Vec<Block>, source: Arc<str> }   // source = Originaltext für verlustfreies Schreiben
pub struct Block { id: BlockId, kind: BlockKind, content: Inline, children: Vec<Block>, origin: Option<Range<usize>>, dirty: bool }
pub enum BlockKind {
  Paragraph, Heading(u8 /*1..=3*/), BulletItem, OrderedItem { start: u32 }, TaskItem { checked: bool },
  Quote, CodeBlock { lang: Option<SharedString> }, Table(TableData), Image { src, alt, title },
  Rule, Raw /* unbekanntes Markdown/HTML, unverändert */, Custom(CustomNodeId),
}
pub struct Inline { text: String, marks: Vec<MarkSpan> }         // Spans über Byte-Bereiche, sortiert, ohne Überlappung gleicher Art
pub enum Mark { Bold, Italic, Underline /* <u> */, Strike, Code, Highlight /* ==x== */, Link(Url), Custom(CustomMarkId) }
```

- **Verlustfrei:**
  - Jeder Block merkt sich seinen Quellbereich (`origin`).
  - Beim Schreiben werden unveränderte Blöcke als Originaltext kopiert. Nur `dirty`-Blöcke werden neu serialisiert.
  - Leerzeilen und Abstände zwischen unveränderten Blöcken bleiben erhalten.
- **Erweiterungen** (Trait `Extension`):
  - eigene Inline-Knoten und Marks mit Parser, Serializer, Renderer und Eingaberegeln
  - mitgeliefert, aber optional: `WikiLink` (`[[Titel]]`), `Tag` (`#tag`), `Highlight`
  - Sheaf hängt dort Autovervollständigung an (Callback für Vorschläge)

## 3. Transaktionen und Verlauf

- Alle Änderungen laufen über `Transaction` mit Schritten (`ReplaceText`, `SetBlockKind`, `ToggleMark`, `InsertBlock`, `RemoveBlock`, `MoveBlock`, `TableOp`, `SetAttr`).
- Jeder Schritt ist invertierbar. Undo/Redo gruppiert Tippen innerhalb von 500 ms und bis zur nächsten Wortgrenze.
- **Ereignis** `Changed { tx, doc_version }`. Der Host (Sheaf) speichert entprellt.
- **API für Befehle** (öffentlich, mit Tastenkürzeln belegbar):
  - `toggle_mark(Mark)`, `set_block(BlockKind)`, `indent()`/`outdent()`
  - `toggle_task()`, `insert_table(rows, cols)`, `insert_image(src)`, `insert_rule()`
  - `set_link(url)`, `move_block_up/down()`, `fold_heading()`, `check_all()`, `uncheck_all()`
  - `move_checked_to_bottom()`, `find(query) -> Vec<Range>`, `scroll_to(range)`

## 4. Auswahl

- Textauswahl (Anker + Kopf) über Blockgrenzen hinweg.
- Knotenauswahl für Bild, Regel und Tabelle als Ganzes.
- Zellauswahl in Tabellen (Rechteck).
- Mehrfachklick: Wort, Absatz, Block.
- Strg+A: zuerst der Block, dann das Dokument.

## 5. Darstellung

- **Rendering:**
  - Eine `Element`-Implementierung mit Zeilenlayout pro Block über `WindowTextSystem::shape_line`/`shape_text` (Zeilenumbruch).
  - Gecacht pro Block und Breite. Bei Änderung wird nur der betroffene Block neu geshaped.
- **Virtualisierung:** Nur sichtbare Blöcke plus Puffer werden gelayoutet. Höhen werden geschätzt und beim ersten Layout korrigiert.
- **Stil über `EditorStyle`** (vom Host gesetzt, Standard aus dem gpui-component-Theme):

  | Element | Wert |
  |---|---|
  | Titel (H1) | 28 px / 800 |
  | H2 | 19 px / 700 |
  | H3 | 16 px / 700 |
  | Text | 15,5 px, Zeilenhöhe 1,6 |
  | Code | Monospace, Hintergrund `surface2` |
  | Zitat | Linie links in Akzentfarbe |
  | Checkbox | Kreis 21 px, abgehakt gefüllt in Akzentfarbe, Text leise und durchgestrichen |
  | Tabellen | Hairlines, Kopfzeile fett |
  | Links und Tags | Akzentfarbe |
  | Markierung | Akzent 25 % |
  | Bilder | Radius 12, max. Inhaltsbreite |

- **Inhaltsbreite** max. 700 px, zentriert (Host-Option).
- **Erster Block als Titel:** Er wird als H1 dargestellt, auch wenn er nur ein Absatz ist (Option `first_line_is_title`, wie Apple Notizen).

## 6. Eingabe

- **IME:** über `EntityInputHandler` (marked text, Vorschlagsfenster an Cursorposition). Pflichttest mit Akzent-Tasten (´ + e), Compose und ibus-pinyin *(prüfen: bekannter Panic-Bug in GPUI beim erneuten Tippen nach gelöschtem IME-Text, Workaround dokumentieren)*.
- **Eingaberegeln** (wie Tiptap, abschaltbar):

  | Eingabe | Wirkung |
  |---|---|
  | `# `, `## `, `### ` | Überschriften |
  | `- `, `* ` | Aufzählung |
  | `1. ` | Nummerierung |
  | `[] `, `[ ] `, `- [ ] ` | Checkliste |
  | `> ` | Zitat |
  | ` ``` ` | Code |
  | `---` | Linie |
  | `**x**`, `*x*`, `~~x~~`, `` `x` ``, `==x==` | Marks |

  Backspace direkt nach einer Regel macht sie rückgängig.
- **Enter:**
  - In Listen und Checklisten neuer Eintrag. Leerer Eintrag + Enter beendet die Liste.
  - Shift+Enter ist ein weicher Umbruch.
  - Tab/Shift+Tab rückt ein und aus.
- **Tastenkürzel** (konfigurierbar):

  | Kürzel | Wirkung |
  |---|---|
  | Strg+B / I / U | fett, kursiv, unterstrichen |
  | Strg+Shift+X | durchgestrichen |
  | Strg+E | Code |
  | Strg+Shift+H | markieren |
  | Strg+K | Link |
  | Strg+Shift+L | Checkliste |
  | Strg+Alt+1..3 | Überschriften |
  | Strg+Alt+0 | Text |
  | Strg+Enter | Checkbox umschalten |
  | Alt+↑/↓ | Block verschieben |
  | Strg+Z / Strg+Shift+Z | Undo / Redo |

## 7. Zwischenablage

- **Kopieren:** Markdown als `text/plain` und, wenn verfügbar, HTML.
- **Einfügen**, in dieser Reihenfolge:
  1. Bilddaten → Host-Callback `on_image(bytes) -> src`
  2. HTML → Dokument (Absätze, Überschriften, Listen, Links, Fett, Kursiv, Tabellen)
  3. Markdown-Text → parsen
  4. Klartext
- Eingefügte URLs auf einer Auswahl werden zu Links.

## 8. Tabellen

- GFM-Tabellen.
- Bearbeitung zellweise: Tab springt zur nächsten Zelle, am Ende kommt eine neue Zeile.
- Griffe an Zeilen und Spalten mit Menü: einfügen davor/danach, löschen, verschieben, ausrichten.
- Spaltenbreite ziehen. Die Breite ist Darstellung, nicht Markdown, und wird über den Host als Metadaten gespeichert (`on_meta_changed`).

## 9. Bilder und Dateien

- `![alt](pfad)`. Relative Pfade löst ein Host-Callback auf (`resolve_src`).
- Bilder werden asynchron geladen und verkleinert gecacht (GPUI `img` mit eigener Quelle).
- Größe per Ziehen an der Ecke. Gespeichert wird das wie bei Obsidian als `![alt|400](pfad)`, wenn die Option an ist.
- Andere Dateien als Anhang-Zeile (Symbol, Name, Größe). Klick → Host-Callback.

## 10. Optionale UI-Teile (Feature `ui`, standardmäßig an)

- **`SlashMenu`:** `/` am Zeilenanfang oder nach Leerzeichen öffnet eine filterbare Liste aller Blocktypen und Host-Einträge, etwa „Vorlage einfügen“.
- **`FormatBar`:**
  - Die adaptive Werkzeugleiste unten schwebend wie im Sheaf-Prototyp.
  - Ohne Auswahl: Aa (Stile), Checkliste, Tabelle, Bild, Link.
  - Mit Textauswahl: B, I, U, S, Markieren, Link.
  - Mit mehreren Zeilen: Liste, Einrücken, Zitat.
  - In einer Tabelle: Tabellenaktionen.
- **`LinkPopover`:** Link bearbeiten, öffnen, entfernen.
- **`FindBar`:** Suche im Dokument (Strg+F) mit Treffer-Hervorhebung. Der Host kann Treffer vorgeben, etwa aus der Sheaf-Suche, Sprung zur ersten Fundstelle.
- **Einklappen:** Pfeil links neben Überschriften bei Hover. Der Zustand ist Host-Metadaten.

## 11. Barrierefreiheit

- Wenn die GPUI-Version AccessKit enthält *(prüfen)*: Rolle Dokument, Blöcke mit Rolle, Checkbox mit Zustand, Auswahl und Cursor gemeldet.
- Sonst dokumentieren und später nachziehen.
- Volle Tastaturbedienung ist Pflicht, unabhängig davon.

## 12. Tests

- **Round-Trip:** CommonMark-Spec-Beispiele, GFM-Beispiele und ein eigener Korpus (Notizen-Beispiele aus dem Prototyp, Obsidian-typische Dateien). Parse → Serialize unverändert ergibt byte-identischen Text.
- **Normalisierung:** Geänderte Blöcke werden in einem festen Stil geschrieben, mit Snapshot-Tests (`insta`):
  - `-` für Listen
  - `**` für fett, `*` für kursiv
  - `- [ ]` für Aufgaben
  - Tabellen ausgerichtet
- **Property-Tests (`proptest`):** zufällige Befehlsfolgen. Invarianten: Marks sortiert und ohne Überlappung, Undo aller Schritte ergibt das Original, Serialize→Parse→Serialize ist stabil.
- **Interaktionstests** mit `gpui::TestAppContext`/`VisualTestContext`: Eingaberegeln, Enter in Listen, Tab in Tabellen, IME-Simulation, Einfügen.
- **Benchmarks (`criterion`):** Parse 1 MB, Tastendruck in 10.000 Zeilen, Shaping beim Scrollen.

## 13. Beispiele, Doku, Auffindbarkeit

- `examples/basic.rs` (minimal), `examples/notes.rs` (mit FormatBar, SlashMenu, Wikilinks, Bildern).
- README:
  - GIF oben
  - 10-Zeilen-Quickstart
  - Funktionsliste
  - Tabelle der Tastenkürzel
  - Vergleich mit dem Editor von gpui-component („code/plain text“ vs. „rich text/WYSIWYG“)
- `Cargo.toml`:
  - keywords: `gpui`, `markdown`, `editor`, `wysiwyg`, `rich-text`
  - categories: `gui`, `text-editors`
- GitHub-Topics: `gpui`, `zed`, `markdown-editor`, `wysiwyg`, `rust-gui`, `rich-text-editor`.
- docs.rs mit Beispielen an jeder öffentlichen API.
- **Weg nach oben:**
  - Nach 0.1 ein Issue bzw. eine Discussion bei longbridge/gpui-component: Vorschlag, die Crate als Komponente in GPUI Kit aufzunehmen.
  - Deren Regeln: ein PR macht eine Sache, Stil wie im Repo. KI-gestützte Beiträge sind erlaubt.
  - Bis dahin bleibt die Crate eigenständig und folgt den gpui-pre-Versionen von gpui-component.
