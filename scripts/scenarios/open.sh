# Opened, as by a click on the neck or the shortcut.
shell_eval 'visor.notch.toggle()' >/dev/null
shell_wait_for 'visor.notch.state === "open"'
