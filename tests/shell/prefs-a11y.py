#!/usr/bin/env python3
"""Reads the settings window through the accessibility bus of the sandbox.

The shell cannot look into the window, which runs in its own process; this is
how the tests read its texts and find its widgets (scripts/lib/prefs.sh).

  prefs-a11y.py texts               every text that shows, one per line as "role | name"
  prefs-a11y.py where NAME [ROLE]   "x y" of the centre of the first widget that shows
                                    with that name (and role), from the corner of its window
  prefs-a11y.py focus               "role | name" of the widget with the keyboard focus
"""
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

APP = "org.gnome.Shell.Extensions"


def showing(node):
    for i in range(node.get_child_count()):
        child = node.get_child_at_index(i)
        if child is None:
            continue
        try:
            states = child.get_state_set()
            if child.get_role() != Atspi.Role.FRAME and not states.contains(Atspi.StateType.SHOWING):
                continue
            yield child
            yield from showing(child)
        except Exception:  # a widget that went away while we looked
            continue


def widgets():
    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app is not None and app.get_name() == APP:
            yield from showing(app)


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "texts"
    if command == "texts":
        for node in widgets():
            if node.get_name():
                print(f"{node.get_role_name()} | {node.get_name()}")
        return 0
    if command == "focus":
        for node in widgets():
            if node.get_state_set().contains(Atspi.StateType.FOCUSED):
                print(f"{node.get_role_name()} | {node.get_name()}")
        return 0
    if command == "where":
        name = sys.argv[2]
        role = sys.argv[3] if len(sys.argv) > 3 else None
        for node in widgets():
            if node.get_name() == name and role in (None, node.get_role_name()):
                box = node.get_extents(Atspi.CoordType.WINDOW)
                print(box.x + box.width // 2, box.y + box.height // 2)
                return 0
        print(f"prefs-a11y: nothing shows with the name {name!r}", file=sys.stderr)
        return 1
    print(__doc__, file=sys.stderr)
    return 2


sys.exit(main())
