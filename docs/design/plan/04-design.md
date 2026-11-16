# 04 · Design

Quelle der Wahrheit sind die Prototypen. Diese Datei hält ihre Werte fest, damit St-CSS (Visor) und GPUI-Theme (Sheaf, Editor) dieselben Zahlen nutzen.

## Haltung

- Ruhig wie Apple, eingebettet wie GNOME. Eine Akzentfarbe (die des Systems), Bernstein nur für „wartet auf dich“.
- Keine Karten in Visor: Abstand und Hairlines gliedern. Flächen nur für Hover, Eingaben und Buttons.
- Sekundäres erscheint bei Hover oder Fokus.
- Jede Bewegung hat einen Grund: Wachsen aus der Leiste, Hereinschieben, Bestätigen. Es gibt nichts Dekoratives außer den kleinen Agenten-Blobs, und die bewegen sich nur bei offenem Panel.

## Bewegung

| Name | Wert | Nutzung |
|---|---|---|
| spring | Gedämpfte Feder, Steifigkeit ≈ 300, Dämpfung ≈ 26. CSS-Entsprechung: `linear(0,.006,.025 2.8%,.101 6.1%,.539 18.9%,.721 25.3%,.849 31.5%,.937 38.1%,.968 41.8%,.991 45.7%,1.006 50.1%,1.015 55%,1.017 63.9%,1.001)` | Notch hint/peek/open (500/620 ms), Schalter, Karten-Hover, Editor hereinschieben (350 ms), Schnellnotiz (450 ms) |
| ease-out | `cubic-bezier(.22,1,.36,1)` bzw. `EASE_OUT_QUINT` | Schließen (400 ms), Popover (250 ms), Inhalt einblenden |
| Inhalt | Opazität 0→1 in 300 ms, 80 ms verzögert. translateY −6 px → 0 und scale 0,97 → 1 mit spring | Peek-Chips, Sheet |
| reduziert | `enable-animations=false` → 0 ms überall | |

## Visor: Farben

Der Körper hat immer die Farbe der Leiste. Die Vordergrund-Tokens hängen von der Helligkeit dieser Farbe ab (L < 0,5 → dunkler Satz).

| Token | Dunkle Leiste | Helle Leiste |
|---|---|---|
| bar (Körper) | Farbe der Leiste, Standard `#000` | Farbe der Leiste, z. B. `#f6f5f4` |
| fg | `#f5f5f7` | `#1d1d1f` |
| muted | fg 60 % | fg 60 % |
| faint | fg 36 % | fg 38 % |
| surface (Hover, Eingaben) | weiß 7 % | schwarz 5 % |
| surface2 (Buttons, Tracks) | weiß 12 % | schwarz 9 % |
| pop (Ergebnis-Overlay) | `#232327` | `#fff` |
| hair | weiß 8 % | schwarz 8 % |
| accent | Systemakzent (Standard `#3584e4`) | gleich |
| waiting | `#f6a33b`, Fläche 10 % | gleich |

## Visor: Maße

| Element | Wert |
|---|---|
| Leiste | Höhe der echten Leiste (Prototyp 32 px) |
| Hals | Inhalt der Uhr, 14 px Innenabstand links und rechts, Schrift der Leiste |
| Ohren | 16 px offen, 7 px hint, konkaver Viertelkreis in Leistenfarbe |
| hint | Halsbreite + 40 × 8, Radius 8 |
| peek | Chips + 28 × 56, Radius 24, Chips 12 px/500, Höhe 26, Radius voll, Abstand 8 |
| open | Breite 960 (800/1120 wählbar), Höhe = Inhalt, max. 820, Radius unten 30 |
| Schatten | `0 34px 70px -24px rgba(0,0,0,.75)`, erst nach dem Einrasten |
| Sheet-Innenabstand | 0 24 20 |
| Suchzeile | Höhe 56, Symbol 18, Eingabe 17 px/500, Hairline unten |
| Dock | Linke Hairline, 10 px Abstand, Symbolknöpfe 30×30, Radius 9, Symbol 17, Farbe muted → fg bei Hover |
| Spalten | 1,2fr : 1fr, Trennlinie mit 24 px Abstand beidseitig, oben 16 |
| Abschnitt | Abstand 20 zwischen Abschnitten. Label 12 px/600 faint, Höhe 20. Rechte Links erscheinen bei Hover |
| Zeile | min. Höhe 46, Innenabstand 6 8 (negativ ausgeglichen), Radius 11, Hover surface, Symbolspalte 28 |
| Zeilentext | Titel 13 px/600, Meta 11,5 px muted, große Zahl (Timer) 17 px/600 tabellarisch |
| Buttons | Höhe 28, Innenabstand 0 12, Radius 8, 12 px/600. Primär = Akzent mit Weiß, ghost = transparent und muted |
| Runde Knöpfe | 30×30. Abspielen gefüllt fg mit Symbol in Leistenfarbe |
| Fortschritt | 2 px, Track surface2, Füllung muted (Timer) bzw. Akzent (Download) |
| Schalter | 38×22, Knopf 18, an = Akzent |
| Ergebnis-Overlay | 6 px unter der Suchzeile, pop, Radius 16, Innenabstand 6. Zeile 8 10, Radius 11, Kachel 30 Radius 9. Auswahl Akzent 22 %. Gruppenlabel 10,5 px/700 GROSS faint |
| Mitteilung | App-Symbol 28 Radius 8, App 11 px/600, Zeit 11 px faint, Titel 13 px/600, Text 12,5 px muted max. 2 Zeilen |
| Agent wartend | Bernstein 10 % Fläche, Radius 12. Frage in Monospace 11,5 px auf surface2, Radius 5 |
| Fokus | 2 px Akzent-Ring, 2 px Abstand |

## Sheaf: Farben (Adwaita-Werte, wie im Prototyp)

| Token | Dunkel | Hell |
|---|---|---|
| window | `#222226` | `#fafafb` |
| view (Editor) | `#1d1d20` | `#ffffff` |
| headerbar | `#2e2e32` | `#ffffff` |
| sidebar/popover | `#38383d` | `#ffffff` |
| card (Galerie) | `#2a2a2e` | `#f4f4f6` |
| fg | `#f5f5f7` | `#1d1d1f` |
| muted / faint | fg 62 % / 38 % | fg 62 % / 40 % |
| hover / selected | weiß 7 % / 11 % | schwarz 5 % / 9 % |
| hair | weiß 8 % | schwarz 9 % |
| accent | Portal-Akzent | gleich |

## Sheaf: Maße

| Element | Wert |
|---|---|
| Fenster | Radius 15, Kopfleiste 47, Flachknöpfe 34×34 Radius 8, Schließen-Knopf rund 24 |
| Suchfeld | Höhe 34, Radius 8, Fläche hover, 14 px |
| Chips | Höhe 28, Innenabstand 0 11, 12,5 px/600, an = fg auf view (invertiert) |
| Galerie | Raster `auto-fill, minmax(200px, 1fr)`, Abstand 16, Rand 8 24 30 |
| Karte | Höhe 200, Radius 14, card + 1 px hair, Innenabstand 14. Vorschau 11,5 px/1,5 muted, Überschrift darin 13 px/800 fg. Verlauf unten 50 px. Hover −2 px spring |
| Karten-Titel | 13,5 px/700 zentriert, 10 px Abstand oben. Meta 12 px faint |
| Gruppenlabel | 13 px/700 faint, 14 26 2 |
| Editor | max. 700 breit, Rand 18 48 120. Datum 12 px faint zentriert. H1 28/800 −0,02em, H2 19/700, Text 15,5/1,6 |
| Checkbox | Kreis 21, Rand 1,6 faint. Abgehakt Akzent mit weißem Haken, Druck-Skalierung 0,85 spring |
| Tabelle | 14,5 px, Zellen 8 12, Hairlines, Kopfzeile fett auf hover, Zahlen rechts tabellarisch |
| FormatBar | unten 20 mittig, pop, Radius 14, Innenabstand 5. Knöpfe 38×36, Trenner 1 px hair. Schatten `0 10px 30px -6px rgba(0,0,0,.5)` |
| Stil-Popover | 250 breit, Radius 14, 70 über dem Boden, Zeilen 8 12 Radius 9 |
| Schnellnotiz | 380×300, Radius 14, Kopfleiste 42, Text 15/1,55, Fußzeile mit Hairline |

## Symbole

- **Visor** nutzt symbolische Icons aus dem Systemthema (Adwaita): `media-playback-*`, `alarm-symbolic`, `folder-download-symbolic`, `x-office-calendar-symbolic`, `preferences-system-notifications-symbolic`, `view-grid-symbolic`.
- **Eigene Symbole** gibt es nur für den T3-Blob (gezeichnet) und das Visor-Logo.
- **Sheaf** nutzt die Adwaita-Symbole als SVG-Assets (Lizenz CC-BY-SA, Herkunft im Repo vermerkt).
- **App-Symbol Sheaf:** im GNOME-Stil (Vorlage App Icon Requirements), ein gestapelter Notizzettel in warmem Gelb mit Akzentlinie. Erstellt als SVG, dazu eine symbolische Version.
- **Logo Visor:** eine abgerundete Leiste mit herabhängender Notch, einfarbig, funktioniert in 16 px.

## Texte

- **Ton:** kurz, freundlich, ohne Ausrufezeichen. Deutsch mit „du“-freier Formulierung wo möglich (Befehle als Infinitiv oder Substantiv: „Neue Notiz“, „Alle löschen“).
- **Feste Begriffe:**

  | Deutsch | Englisch |
  |---|---|
  | Jetzt | Now |
  | Als Nächstes | Up Next |
  | Mitteilungen | Notifications |
  | Nicht stören | Do Not Disturb |
  | Module | Modules |
  | Entdecken | Discover |
  | Notizen | Notes |
  | Schnellnotiz | Quick Note |
  | Zuletzt gelöscht | Recently Deleted |
  | Angeheftet | Pinned |
  | Intelligenter Ordner | Smart Folder |
