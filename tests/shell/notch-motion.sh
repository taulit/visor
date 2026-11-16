#!/usr/bin/env bash
# Runtime check of the animation of the notch.
#   scripts/nested.sh --animations -- tests/shell/notch-motion.sh   springs, overshoot, retargeting
#   scripts/nested.sh -- tests/shell/notch-motion.sh                animations off: the size jumps
set -euo pipefail
source "$VISOR_REPO/tests/shell/lib.sh"

animated="$(shell_eval 'St.Settings.get().enable_animations')"
echo "enable-animations: $animated"
# Selected samples as "ms:WxH", for the report.
row='(s => s.filter((_, i) => i % 5 === 0).map(([t, w, h]) => `${t}:${w}x${h}`).join(" "))'

echo "--- idle -> open"
open="$(shell_eval "visorTest.sample(visor.notch, () => visor.notch.open(), 900)")"
shell_eval "$row($open)"
final="$(shell_eval "(s => s.at(-1).slice(1, 3))($open)")"
echo "final size: $final, largest: $(shell_eval "(s => [Math.max(...s.map(e => e[1])), Math.max(...s.map(e => e[2]))])($open)")"
first="$(shell_eval "(s => s[0].slice(1, 3))($open)")"
full="$(shell_eval "(s => s.at(-1)[2])($open)")"

if [[ "$animated" == true ]]; then
    check 'starts small' "(s => s[0][2] < s.at(-1)[2] / 2)($open)" true
    check 'has intermediate sizes' "(s => new Set(s.map(e => e[2])).size > 10)($open)" true
    check 'height overshoots the target' "(s => Math.max(...s.map(e => e[2])) > s.at(-1)[2])($open)" true
    check 'width overshoots the target' "(s => Math.max(...s.map(e => e[1])) > s.at(-1)[1])($open)" true
    check 'overshoot stays below 4 %' "(s => Math.max(...s.map(e => e[2])) < s.at(-1)[2] * 1.04)($open)" true
    check 'at rest after 620 ms' "(s => s.filter(e => e[0] > 660).every(e => e[2] === s.at(-1)[2]))($open)" true
    # The corners have a radius of 30: a rectangle fits into them 9 px further in.
    check 'while it grows, the clip of the content stays inside the rounded corners' "(s => s.filter(e => e[0] < 500 && e[2] >= 30).every(e => e[3] === e[1] - 18 && e[4] === e[2] - 9))($open)" true
else
    check 'first sample is the final size' "JSON.stringify($first) === JSON.stringify($final)" true
    check 'only one size seen' "(s => new Set(s.map(e => e[2])).size)($open)" 1
fi
check 'no timeline left' 'visor.notch.motion.running' false
check 'at rest the clip is as large as the body' "(s => s.at(-1)[3] === s.at(-1)[1] && s.at(-1)[4] === s.at(-1)[2])($open)" true
check 'shadow is shown once settled' 'visor.notch.shadow.visible' true

echo "--- open -> idle (ease-out quint, 400 ms)"
close="$(shell_eval "visorTest.sample(visor.notch, () => visor.notch.close(), 600)")"
shell_eval "$row($close)"
if [[ "$animated" == true ]]; then
    check 'never grows while closing' "(s => s.every((e, i) => i === 0 || e[2] <= s[i - 1][2]))($close)" true
    check 'still visible after 100 ms' "(s => s.find(e => e[0] >= 100)[2] > 0)($close)" true
    check 'gone after 400 ms' "(s => s.filter(e => e[0] > 440).every(e => e[2] === 0))($close)" true
else
    check 'gone at once' "(s => s.every(e => e[2] === 0))($close)" true
fi
check 'body hidden in idle' 'visor.notch.body.visible' false
check 'no timeline, no timer in idle' '[visor.notch.motion.running, visor.notch.timers.size]' '[false,0]'

echo "--- retarget: open, then close after 120 ms"
retarget="$(shell_eval "visorTest.sample(visor.notch, () => {
    visor.notch.open();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => (visor.notch.close(), false));
}, 700)")"
shell_eval "$row($retarget)"
if [[ "$animated" == true ]]; then
    check 'turns around below the full height' "(s => { const top = Math.max(...s.map(e => e[2])); return top > 20 && top < $full; })($retarget)" true
    check 'no jump at the turn (largest step down < 25 % of the peak)' "(s => { const top = Math.max(...s.map(e => e[2])); return Math.max(...s.map((e, i) => i ? s[i - 1][2] - e[2] : 0)) < top / 4; })($retarget)" true
fi
check 'ends in idle and hidden' '[visor.notch.state, visor.notch.body.visible, visor.notch.motion.running]' '["idle",false,false]'

echo "--- idle -> hint -> peek (retarget while the hint still grows)"
shell_eval 'visor.getSettings().set_int("peek-delay", 100)' >/dev/null
peek="$(shell_eval "visorTest.sample(visor.notch, () => visor.notch.dispatch({type: 'enter'}), 900)")"
shell_eval "$row($peek)"
check 'ends in peek at 56 px' "[visor.notch.state, (s => s.at(-1)[2])($peek)]" '["peek",56]'
if [[ "$animated" == true ]]; then
    check 'height never falls on the way from hint to peek' "(s => s.filter(e => e[0] < 300).every((e, i, a) => i === 0 || e[2] >= a[i - 1][2]))($peek)" true
fi
shell_eval 'visor.notch.dispatch({type: "leave"})' >/dev/null
pause 800
check 'back in idle, quiet' '[visor.notch.state, visor.notch.body.visible, visor.notch.motion.running, visor.notch.timers.size]' '["idle",false,false,0]'

finish
