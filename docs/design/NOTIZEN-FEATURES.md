# Notizen-App: Feature-Liste (Stand 16.11.2026)

App: **Sheaf** (Anzeigename „Notizen“ / „Notes“), Rust + GPUI. Layout: **Galerie** (prototype-notes-app.html, Variante 3). Speicherung: Markdown-Dateien in einem lokalen Ordner, Sync macht der Nutzer selbst (Nextcloud, Syncthing, Git).

Legende: **1.0** = im ersten fertigen Release · **später** = nach 1.0 · **nein** = bewusst weggelassen

## Was Apple Notizen kann

| Bereich | Funktion | Wir |
|---|---|---|
| Ordnung | Ordner, verschachtelt | 1.0 (Unterordner im Dateisystem) |
| | Tags (`#tag` im Text) mit Tag-Browser | 1.0 |
| | Intelligente Ordner (gespeicherte Filter: Tag, Datum, hat Checkliste, hat Anhang …) | 1.0 |
| | Notizen anheften | 1.0 |
| | Galerie- und Listenansicht, Sortierung (bearbeitet, erstellt, Titel) | 1.0 |
| | Gruppierung nach Heute, Gestern, Letzte 7 Tage, Monat | 1.0 |
| | Zuletzt gelöscht (30 Tage) | 1.0 (Papierkorb-Ordner) |
| Schreiben | Stile: Titel, Überschrift, Unterüberschrift, Text, Monospace | 1.0 |
| | Fett, kursiv, unterstrichen, durchgestrichen, Link | 1.0 |
| | Aufzählung, Nummerierung, Strichliste, Einrücken | 1.0 |
| | Zitatblock | 1.0 |
| | Checklisten, Abgehaktes nach unten, alle abhaken oder zurücksetzen | 1.0 |
| | Tabellen (Zeilen und Spalten hinzufügen, verschieben) | 1.0 |
| | Einklappbare Überschriften | 1.0 |
| | Textfarben und Markieren | 1.0 (wenige feste Farben, im Markdown als `==Markierung==`) |
| | Adaptive Werkzeugleiste (zeigt passende Werkzeuge zur Auswahl) | 1.0 |
| | Links zwischen Notizen | 1.0 (`[[Notiz]]`) |
| Anhänge | Bilder (Einfügen, Ziehen, Zwischenablage) | 1.0 (im Ordner `_attachments/` neben der Notiz) |
| | PDFs und Dateien als Anhang mit Vorschau | 1.0 |
| | Anhang-Übersicht (alle Bilder und Dateien) | später |
| | Dokumente scannen | nein (Desktop) |
| | Zeichnen, Handschrift | nein |
| | Audio aufnehmen mit Transkription | später (lokal, z. B. Whisper) |
| Suche | Volltextsuche über Titel, Text, Tags | 1.0 |
| | Text in Bildern finden (OCR) | später (lokal mit Tesseract) |
| | Suchvorschläge und Filter | 1.0 |
| Schnell | Schnellnotiz von überall | 1.0 (Tastenkürzel und Notch) |
| | Siri, Kurzbefehle | 1.0 als GNOME-Suche und D-Bus |
| Schutz | Notiz sperren mit Passwort | später (verschlüsselte Datei, age) |
| Teilen | Zusammenarbeit, Kommentare, Erwähnungen | nein (lokal, kein Server) |
| | Exportieren als PDF, Markdown, Drucken | 1.0 |
| Rechnen | Mathe-Notizen (`=` rechnet aus) | später |
| KI | Zusammenfassen, Umschreiben | später, optional, abschaltbar |

## Was Nutzer bei Apple vermissen (und wir mitnehmen)

| Wunsch | Wir |
|---|---|
| Echte Markdown-Dateien statt geschlossener Datenbank | 1.0, das Fundament |
| Vollständiger Export ohne Verlust | 1.0 (die Dateien sind der Export) |
| Unscharfe Suche, Tippfehler-tolerant | 1.0 |
| Gespeicherte Suchen | 1.0 (= intelligente Ordner) |
| Schnell bei Tausenden Notizen | 1.0 (Index, virtuelle Galerie; Ziel: 10.000 Notizen ohne Ruckeln) |
| Vorlagen | 1.0 (`.sheaf/templates/`) |
| Rückverweise (welche Notizen zeigen hierher) | 1.0 |
| Markieren, Textfarben | 1.0 |
| Tabellen in der Größe anpassen | 1.0 (Spaltenbreite ziehen) |
| Läuft überall | Linux zuerst; Dateien sind portabel |
| Ordner sperren | später |
| Automatisierung | 1.0 über D-Bus und CLI (`sheaf new "…"`) |
| Befehlsmenü beim Tippen von `/` | 1.0 |
| Tastatur zuerst: alles per Kürzel, Befehlspalette Strg+K | 1.0 |

## Suche (der wichtigste Teil)

- Ein Feld oben in der Galerie, sofort beim Tippen, unter 30 ms bei 10.000 Notizen.
- Tippfehler-tolerant und Präfixsuche („ausschr“ findet „Ausschreibung“), Umlaute egal („einkauf“ = „Einkäufe“).
- Gewichtung: Titel vor Überschriften vor Text; zuletzt bearbeitet als Gleichstand-Brecher.
- Filter direkt im Feld: `#tag`, `ordner:arbeit`, `hat:checkliste`, `hat:bild`, `offen:` (unerledigte Aufgaben), `geändert:woche`.
- Treffer werden in der Karte hervorgehoben; Enter öffnet die Notiz und springt zur Fundstelle.
- Dieselbe Suche speist die Notch und die GNOME-Suche (über einen kleinen Suchdienst ohne Fenster).
