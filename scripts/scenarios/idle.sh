# The notch at rest: only the neck with the clock in the panel.
shell_wait_for 'Main.panel.visible && visor.notch.state === "idle"'
