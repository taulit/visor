# The pointer rests on the neck until the peek delay has passed.
shell_eval 'visor.notch.dispatch({type: "enter"})' >/dev/null
shell_wait_for 'visor.notch.state === "peek"'
