# Only 'ahead' modules: nothing runs, so the left column is absent and the
# panel is 600 wide.
source "$repo/scripts/scenarios/content-lib.sh"
content_register "['ahead']"
shell_eval 'visor.notch.open()' >/dev/null
