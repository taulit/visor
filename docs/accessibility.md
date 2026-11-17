# Accessibility

What Visor hands to the accessibility layer, how it is used with the keyboard alone, and how it follows the
accessibility settings of the desktop. `tests/shell/a11y.sh` checks most of it in the sandboxed shell
(`pnpm run test:shell a11y`); the last section says what the test covers and what was only reasoned about.
**No screen reader was run.**

## Keyboard

| Where                                                 | Key                                                                                                | What it does                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anywhere                                              | Super+V (shortcut of the shell for the notification list), or the extra shortcut from the settings | Opens or closes the panel                                                                                                                             |
| Neck in the top bar, focused (Ctrl+Alt+Tab → Top Bar) | Enter, Space                                                                                       | Opens or closes the panel                                                                                                                             |
|                                                       | Escape                                                                                             | Closes the panel                                                                                                                                      |
| Panel                                                 | Tab                                                                                                | Next stop: search → rows of "Now" → sections on the right, top to bottom ("Up Next", "Notifications", …) → dock icons → search again                  |
|                                                       | Shift+Tab                                                                                          | The same stops backwards                                                                                                                              |
|                                                       | Arrow keys                                                                                         | To the nearest stop in that direction: Down from the search field enters the rows, Up and Down walk a list, Left and Right reach the buttons of a row |
|                                                       | Escape                                                                                             | Clears the search; if it is empty, leaves a module view; otherwise closes the panel                                                                   |
| Row                                                   | Enter                                                                                              | What a click does: activates the row, else runs its main button, else flips its switch, else opens it                                                 |
|                                                       | Space                                                                                              | Opens or closes a row that has more to show                                                                                                           |
| Button, switch, dock icon                             | Enter, Space                                                                                       | Presses it                                                                                                                                            |
| Search field with text                                | Up, Down                                                                                           | Moves the selection in the list of results                                                                                                            |
|                                                       | Enter                                                                                              | Runs the selected result                                                                                                                              |
|                                                       | Ctrl+Enter                                                                                         | Its second action (an app: new window)                                                                                                                |
|                                                       | Tab                                                                                                | Stays in the search field while results cover the rows                                                                                                |
| Module view                                           | Tab, Shift+Tab, arrows                                                                             | Walk the view, the Back button and the buttons in its header                                                                                          |

- Opening puts the focus into the search field. Closing gives it back to the actor that had it before; that
  is done by the modal grab of the shell.
- Tab cycles inside the panel, as in every menu of the shell. Escape is the way out, so there is no trap.
- Buttons that appear only on hover (row actions, section links, the chevron) also appear while the keyboard
  focus is in their row or section.
- What an opened row shows comes right after the row in the Tab order.
- The focus is drawn as a 2 px ring in the accent colour (`:focus` in `styles/`), on the row as a whole while
  the row itself has the focus.
- The chips of the peek state are buttons, but peek shows on hover and for three seconds after an event; there
  is no keyboard way into it. Everything a chip says is also in the panel.

## Roles and names

| Actor                     | Role                      | Name                                                                                         |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| Neck                      | push button               | The clock text; with the dot: ", unread notifications" or ", something waits for you"        |
| Panel                     | panel                     | "Visor"                                                                                      |
| Search field              | St's entry                | "Search"                                                                                     |
| Dock icon                 | push button               | Module name, with the badge: "Notes, 2"                                                      |
| Section                   | panel                     | Its title; the title label is a heading                                                      |
| Row (the focusable part)  | list item                 | Lead, title, subtitle, detail, meta, value, and the status in words: "waits for you", "done" |
| Row that can be opened    | + expandable, expanded    | The chevron is a toggle button "Show details of …" / "Hide details of …"                     |
| Row action, control, link | push button               | Its label (icon buttons: the label they were given)                                          |
| Switch                    | check box, checked state  | What it switches (in a row: the title of the row)                                            |
| Progress bar              | progress bar              |                                                                                              |
| Search result             | list item, selected state | Title and subtitle; group labels are headings, the list is a list                            |
| Peek chip                 | push button               | Module name, text, and "waits for you" for an amber chip                                     |
| Scroll views              | scroll pane               |                                                                                              |

Colour is never the only carrier: amber rows and chips and the dot next to the clock have their meaning in the
name, a finished row says "done", and in high contrast the waiting row has an amber outline as well.

The search field keeps the role St gives it. Setting `Atk.Role.ENTRY` on the `St.Entry` froze the sandboxed
shell as soon as the text was cleared with results on screen; the entries of the shell itself set no role either.

The keyboard focus stays in the search field while the selection moves through the results. The selected
result carries the state `selected`; whether a screen reader announces that without a focus change was not
tried.

## Settings of the desktop

- **Reduced motion** (`org.gnome.desktop.interface enable-animations` off): every state is reached in one
  step. No spring, no fade; a flash shows the chips in place and takes them away again, nothing moves. The
  switch knob, the reveal of row buttons and scrolling to the focused row use `ease()`, which the shell turns
  into a jump.
- **High contrast** (`org.gnome.desktop.a11y.interface high-contrast`): the class `visor-hc` on the notch and
  the neck. Secondary text gets the colour of primary text, the search row and the column divider get a solid
  line, the waiting row and ghost buttons an outline, the focus ring stays. Screenshot:
  `screenshots/a11y-high-contrast-dark.png`.
- **Large text** (`text-scaling-factor`): all font sizes are in pt, which St scales with the factor (px it does
  not). At 1.5 rows grow in height, the panel grows with them up to its limit and scrolls beyond; long
  subtitles are ellipsized earlier because the panel keeps its width. Screenshot:
  `screenshots/a11y-large-text-dark.png`.

## Covered by the test, and not

Checked by `tests/shell/a11y.sh` with the demo content, with real key and pointer events:

- every visible actor below the notch and the neck that is reactive or focusable has a specific role and a
  name, in the main view, a module view, the list of modules, with search results on screen, and in peek
  (surfaces that only catch the pointer are exempt: the notch root, the body, the row frame, whose focusable
  part must be a named list item; scroll views need the role only);
- the names above, including the words for amber, done and the dot, and the states checked, expandable,
  expanded, selected;
- the Tab order and that it comes back to the search field, Shift+Tab, arrows, Enter, Space, Escape in
  three steps, the focus ring on the focused row, the focus on the way in and out;
- no running animation and the final size at once with animations off, also for a flash;
- the class and a border in high contrast; at a text scaling factor of 1.5 no label lower than its text, no
  row outside the panel, the same Tab stops;
- a press on a chip opens the panel with the section of its module highlighted for 1.4 s (`visor-marked`), or
  with the view of a dock module.

Only reasoned about, not run:

- a screen reader (Orca): what is announced, in which order, and whether the selected search result is read;
- reaching the neck with Ctrl+Alt+Tab (it is a focusable button in the panel like the stock clock);
- the built-in modules with real data and the T3 Code views: the test walks the demo content, which uses the
  same kit, but a module that builds widgets of its own (the reply field of T3 Code has a name) is not walked;
- contrast ratios were looked at in the screenshots, not computed;
- the light scheme in high contrast and with large text (the rules are the same; only dark was shot);
- right-to-left, a scale factor other than 1, touch.
