# The built-in modules "Up Next" and "Notifications" with content: three
# events in the calendar of the sandbox, one of them about to start with a
# meeting link, and four notifications sent over the session bus of the sandbox.
shell_wait_for 'visor !== null && visor.api !== null'
[[ "$(gjs -m "$repo/tests/shell/calendar-events.js" '[
    {"uid":"review","summary":"Sprint Review","start":6,"minutes":60,"location":"https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0"},
    {"uid":"birthday","summary":"Jukek’s birthday","allDay":1},
    {"uid":"tender","summary":"Tender submission","start":4320,"minutes":30}]' 2>/dev/null)" == done ]]

# With the panel open they are listed without a banner in front of it.
shell_eval 'visor.notch.open()' >/dev/null
send() { gjs -m "$repo/tests/shell/notify.js" "$1" >/dev/null 2>&1 & }
count='Main.messageTray.getSources().flatMap(s => s.notifications).length'
send '{"app":"Files","title":"Download finished","body":"fedora-44.iso","desktop":"org.gnome.Nautilus","actions":["default","Open"]}'
shell_wait_for "$count === 1"
send '{"app":"Calendar","title":"Review requested","body":"fork/feat-mjpeg · 3 files","desktop":"org.gnome.Calendar","actions":["default","Open"]}'
shell_wait_for "$count === 2"
send '{"app":"Firefox","title":"web.whatsapp.com","body":"New message from Mum","desktop":"firefox","actions":["default","Open"]}'
shell_wait_for "$count === 3"
send '{"app":"Settings","title":"Updates available","body":"12 packages can be updated","desktop":"org.gnome.Settings","actions":["default","Open"]}'
shell_wait_for "$count === 4"
# They did not all arrive in this second.
shell_eval '(() => { const ago = { "Updates available": 0, "web.whatsapp.com": 5, "Review requested": 48, "Download finished": 190 }; for (const n of Main.messageTray.getSources().flatMap(s => s.notifications)) n.datetime = GLib.DateTime.new_now_local().add_minutes(-ago[n.title]); return true; })()' >/dev/null
shell_wait_for "(function find(a, out) { if (a.has_style_class_name && a.has_style_class_name('visor-button')) out.push(a); for (const c of a.get_children()) find(c, out); return out; })(visor.notch.root, []).some(b => b.label_actor?.text === 'Join')"
