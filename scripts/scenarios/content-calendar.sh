# "Up Next" with the calendar on: the week above a few events of the sandbox calendar.
# With CALENDAR_MONTH=1 the title is clicked, so the month shows.
source "$repo/scripts/scenarios/content-lib.sh"
dconf write /org/gnome/shell/extensions/visor/upcoming-calendar true
gjs -m "$repo/tests/shell/calendar-events.js" '[{"uid":"standup","summary":"Standup","start":50,"minutes":30},
    {"uid":"dentist","summary":"Dentist","start":200,"minutes":45},
    {"uid":"review","summary":"Catalog review","start":1500,"minutes":60},
    {"uid":"release","summary":"Release 1.1","allDay":3}]' >/dev/null
shell_eval 'visor.notch.open()' >/dev/null
sleep 2
if [[ "${CALENDAR_MONTH:-}" == 1 ]]; then
    shell_eval "(() => { const find = (a, out) => { if (a.has_style_class_name?.('visor-calendar-title-button')) out.push(a); for (const c of a.get_children()) find(c, out); return out; }; find(visor.notch.root, []).find(a => a.mapped).emit('clicked', 1); return true; })()" >/dev/null
    sleep 1
fi
