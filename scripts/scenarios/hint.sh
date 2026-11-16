# The pointer came onto the neck. Hover preview is off, so it stays a hint.
shell_eval 'visor.getSettings().set_boolean("hover-preview", false)' >/dev/null
shell_eval 'visor.notch.dispatch({type: "enter"})' >/dev/null
shell_wait_for 'visor.notch.state === "hint"'
