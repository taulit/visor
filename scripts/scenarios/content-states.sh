# States that need the keyboard or the pointer: a row with the focus ring and
# its hidden action, hovered rows (the action takes the place of the time),
# an expanded row and the links of a hovered section.
source "$repo/scripts/scenarios/content-lib.sh"
content_register
shell_eval 'visor.notch.open()' >/dev/null
rows="$(content_find visor-row)"
shell_eval "(() => {
    const row = title => $rows.find(r => $(content_find visor-row-title).some(t => t.text === title && r.contains(t)));
    const part = (r, cls) => $(content_find "' + cls + '").find(a => r.contains(a));
    part(row('Midnight City'), 'visor-row-main').grab_key_focus();
    row('tender research').hover = true;
    row('web.whatsapp.com').hover = true;
    part(row('iphone-control'), 'visor-row-chevron').emit('clicked', 1);
    $(content_find visor-section).at(-1).hover = true;
})()" >/dev/null
