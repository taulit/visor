# GNOME Notch: Ergebnis der Prototypen (16.11.2026)

Gewählt: **Runde 4, Variante 1 „Zwei Spalten“**: `prototype-gnome-island-v4.html?variant=1`

## Verhalten
- Ersetzt das Datum/Uhrzeit-Menü in der Mitte der GNOME-Leiste. Die Uhr bleibt in der Leiste.
- Öffnet immer **unter** der Leiste: Das Panel wächst aus der Leiste heraus (konkave Ecken, Farbe der Leiste) und verdeckt keine Elemente der Leiste.
- Drei Stufen: Hover → Notch wölbt sich an · kurz verweilen → Vorschau (max. 4 Chips) · Klick → Panel.
- Folgt GNOME Hell/Dunkel und Akzentfarbe. Federnde Animationen im Apple-Stil.

## Aufbau
- Oben eine Suchzeile (Apps, Rechnen, Währung, `timer`, `notiz`, `t3`), Ergebnisse als Overlay, **keine** Vorschlags-Chips. Rechts das Dock mit Modul-Symbolen.
- Links „Jetzt“: Medien, T3-Sessions, Timer, Downloads. Nur was gerade läuft.
- Rechts „Ausblick“: Als Nächstes (statt Monatskalender), Mitteilungen (3 sichtbar, Rest aufklappbar).
- Keine Karten. Abschnitte durch Abstand und feine Linien. Nur eine Akzentfarbe; Orange nur für „wartet auf dich“.
- Sekundäre Knöpfe erscheinen bei Hover. Agenten: Erlauben/Ablehnen direkt, Antworten/Stoppen/Öffnen beim Aufklappen.

## Modulregel
Jedes Modul belegt genau einen Platz:
1. **Jetzt**: Zeile, nur solange etwas läuft.
2. **Ausblick**: kurzer Abschnitt rechts.
3. **Dock**: Symbol in der Suchzeile mit eigener Ansicht.

Nie eine neue Kachel.

## Bewusst nicht drin
Schnelleinstellungen (bleiben im GNOME-Menü rechts), Zwischenablage (eigene Extension), Monatskalender, Weltuhren, feste Notizen-Kachel. Notizen werden eine eigene App, erreichbar über das Dock.

## Technische Leitplanken
Native GNOME-Shell-Extension (GJS, St, Clutter), kein Webview, kein Electron. Module werden erst beim Öffnen geladen. Agenten-Anbindung (T3 Code) und schwere Arbeit laufen in einem eigenen Prozess (D-Bus), damit die Shell nie hängt. Open Source, Modul-Store später.
