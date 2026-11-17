#!/usr/bin/env bash
# Measures Visor against its budgets (docs/performance.md) in the sandboxed
# headless shell and prints a table. Nothing here touches the session you are
# logged in to.
#
# Usage: scripts/measure.sh [part...]   parts: enable frames search idle memory (default: all)
#   VISOR_MEASURE_IDLE_SECONDS  length of the idle window (default 60)
#   VISOR_MEASURE_CYCLES        open/close cycles and queries of the memory part (default 200)
#
# How each number comes about is described next to the table in docs/performance.md.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
idle_seconds="${VISOR_MEASURE_IDLE_SECONDS:-60}"
cycles="${VISOR_MEASURE_CYCLES:-200}"

# ---------------------------------------------------------------- inside
if [[ "${1:-}" == --inside ]]; then
    part="$2"
    [[ -n "${VISOR_SANDBOX:-}" && "$HOME" == "$VISOR_SANDBOX"/* ]] || { echo "not in the sandbox" >&2; exit 2; }
    source "$repo/scripts/lib/shell.sh"
    source "$repo/scripts/scenarios/content-lib.sh"
    run() { shell_eval "$1" >/dev/null; }
    shell_eval "(() => { $(<"$repo/scripts/lib/measure.js")
        return true; })()" >/dev/null
    M=visorMeasure
    pid="$(shell_eval "$M.pid()")"
    metrics_on() { run 'visor.getSettings().set_boolean("debug-metrics", true)'; }
    # lines NAME: the metric lines of that name the shell wrote so far.
    lines() { grep -a "Visor metrics: $1" "$HOME/shell.log" || true; }
    # field NAME: the values of NAME=… on stdin, one per line.
    field() { grep -o " $1=[0-9.]*" | cut -d= -f2; }
    # stats: "median min max count" of the numbers on stdin.
    stats() { sort -n | awk '{ v[NR] = $1 } END { if (!NR) { print "- - - 0"; exit } m = NR % 2 ? v[(NR + 1) / 2] : (v[NR / 2] + v[NR / 2 + 1]) / 2; printf "%.2f %.2f %.2f %d\n", m, v[1], v[NR], NR }'; }
    # Voluntary context switches of the main thread: one per time the main loop woke up from poll().
    wakeups() { awk '/^voluntary_ctxt_switches/ { print $2 }' "/proc/$pid/task/$pid/status"; }
    # Resident memory plus what the kernel moved to swap: under memory pressure RSS alone shrinks.
    rss_kb() { awk '/^VmRSS|^VmSwap/ { s += $2 } END { print s }' "/proc/$pid/status"; }
    # Anonymous memory: heaps of JS and C, without the files mapped into the process.
    anon_kb() { awk '/^RssAnon|^VmSwap/ { s += $2 } END { print s }' "/proc/$pid/status"; }
    memory() { run "$M.gc()"; echo "$(rss_kb) $(anon_kb)"; }
    # batches N SIZE: the sizes of the batches that add up to N. A call over D-Bus must stay below 25 s.
    batches() { local left="$1"; while ((left > 0)); do echo "$((left < $2 ? left : $2))"; left=$((left - $2)); done; }

    case "$part" in
        enable)
            metrics_on
            run "$M.toggle(20)"
            echo "enable $(lines enable | field ms | stats)"
            ;;
        frames)
            metrics_on
            content_register
            run "$M.cycle(6)"
            run "$M.cycle(6)"
            # The first open builds and styles the sheet; it is reported on its own.
            echo "first-open $(lines 'enter open' | field ms | head -n 1) $(lines 'transition open' | field update-ms-max | head -n 1)"
            echo "enter-open $(lines 'enter open' | field ms | tail -n +2 | stats)"
            echo "enter-idle $(lines 'enter idle' | field ms | stats)"
            for state in open idle; do
                all="$(lines "transition $state" | tail -n +2)"
                echo "frames-$state runs=$(grep -c . <<<"$all")" \
                    "frames=$(field frames <<<"$all" | awk '{ s += $1 } END { print s + 0 }')" \
                    "dropped=$(field dropped <<<"$all" | awk '{ s += $1 } END { print s + 0 }')" \
                    "interval-mean=$(field interval-ms-mean <<<"$all" | stats | cut -d' ' -f1)" \
                    "interval-max=$(field interval-ms-max <<<"$all" | stats | cut -d' ' -f1,3)" \
                    "update-mean=$(field update-ms-mean <<<"$all" | stats | cut -d' ' -f1)" \
                    "update-max=$(field update-ms-max <<<"$all" | stats | cut -d' ' -f1,3)" \
                    "visor-max=$(field visor-ms-max <<<"$all" | stats | cut -d' ' -f1,3)"
            done
            ;;
        search)
            # A launcher for the app search to find.
            run 'visor.notch.open()'
            run "$M.wait(400)"
            texts='["2", "2+", "2+3", "2+3*", "2+3*4", "", "s", "se", "set", "sett", "", "1", "12", "12*", "12*7", "", "f", "fi", "fil", "file", "", "t", "te", "ter", "term"]'
            run "$M.queries(['1+1', ''])"
            out="$(shell_eval "$M.queries($texts).then(r => r.map(x => x.join(' ')).join('|'))" | tr -d '"' | tr '|' '\n')"
            run 'visor.notch.close()'
            # One line per query: list built, next frame begins, laid out, painted (µs after the debounce).
            printf '%s\n' "$out" >"$repo/.shell-test/measure-search.rows"
            echo "search-local $(awk '{ print $1 / 1000 }' <<<"$out" | stats)"
            echo "search-frame-begins $(awk '{ print $2 / 1000 }' <<<"$out" | stats)"
            echo "search-layout $(awk '{ print ($3 - $2) / 1000 }' <<<"$out" | stats)"
            echo "search-paint $(awk '{ print ($4 - $3) / 1000 }' <<<"$out" | stats)"
            echo "search-painted $(awk '{ print $4 / 1000 }' <<<"$out" | stats)"
            ;;
        idle | idle-baseline)
            if [[ "$part" == idle ]]; then
                run "$M.wrap()"
                [[ "$(shell_eval "$M.reenable()")" == true ]] || { echo "Visor did not come back" >&2; exit 1; }
                # Once open and closed again, so the lazily built parts exist as after real use.
                run "$M.cycle(1)"
            fi
            sleep 5
            [[ "$part" == idle ]] && run "$M.count(true)"
            before="$(wakeups)"
            sleep "$idle_seconds"
            after="$(wakeups)"
            echo "$part-wakeups $((after - before))"
            if [[ "$part" == idle ]]; then
                sources="$(shell_eval "$M.count(false).map(([k, n]) => n + 'x ' + k).join('; ')")"
                own="$(shell_eval "$M.count(false).filter(([k]) => !k.startsWith('signal ')).reduce((s, [, n]) => s + n, 0)")"
                handlers="$(shell_eval "$M.count(false).filter(([k]) => k.startsWith('signal ')).reduce((s, [, n]) => s + n, 0)")"
                echo "idle-visor-own $own"
                echo "idle-visor-handlers $handlers"
                echo "idle-visor-sources ${sources//\"/}"
            fi
            ;;
        memory | memory-baseline)
            sleep 3
            echo "$part-start $(memory)"
            if [[ "$part" == memory ]]; then
                run "$M.cycle(1)"
                run 'visor.notch.open()'
                run "$M.queries(['2+3', 'se', ''])"
                run 'visor.notch.close()'
                echo "memory-used-once $(memory)"
                for n in $(batches "$cycles" 25); do run "$M.cycle($n, 250, 150)"; done
                run 'visor.notch.open()'
                run "$M.wait(300)"
                for n in $(batches "$cycles" 100); do
                    run "(async () => { const q = ['2+3*4', 'se', 'fi', '17*3', 'te', '']; for (let i = 0; i < $n; i++) { visor.content.sheet.entry.set_text(q[i % q.length] + (i % 7)); await $M.wait(70); } return true; })()"
                done
                run 'visor.notch.close()'
            else
                # The same amount of use without Visor: the date menu opens and closes, the overview searches.
                run "$M.stockCycle(1)"
                run "$M.stockQueries(3)"
                echo "memory-baseline-used-once $(memory)"
                for n in $(batches "$cycles" 25); do run "$M.stockCycle($n)"; done
                for n in $(batches "$cycles" 100); do run "$M.stockQueries($n)"; done
            fi
            echo "$part-end $(memory)"
            ;;
        *) echo "unknown part: $part" >&2; exit 2 ;;
    esac
    exit 0
fi

# --------------------------------------------------------------- outside
parts=("$@")
[[ ${#parts[@]} -gt 0 ]] || parts=(enable frames search idle memory)
PATH="$repo/node_modules/.bin:$PATH" bash "$repo/scripts/build.sh" >/dev/null || { echo "build failed" >&2; exit 1; }
mkdir -p "$repo/.shell-test"

# inside PART [nested options]: runs one part in a sandbox of its own and prints its result lines.
# What the services of the sandbox say while it is torn down goes to .shell-test/measure-PART.err.
inside() {
    local part="$1"
    shift
    "$repo/scripts/nested.sh" "$@" --log "$repo/.shell-test/measure-$part.log" -- \
        "$repo/scripts/measure.sh" --inside "$part" 2>"$repo/.shell-test/measure-$part.err" ||
        echo "measure.sh: the part $part failed, see .shell-test/measure-$part.err" >&2
}
# value NAME: the rest of the result line that begins with NAME.
value() { sed -n "s/^$1 //p" <<<"$results" | head -n 1; }

results=""
for part in "${parts[@]}"; do
    echo "measuring: $part …" >&2
    case "$part" in
        enable) results+="$(inside enable)"$'\n' ;;
        frames) results+="$(inside frames --animations)"$'\n' ;;
        search) results+="$(inside search --animations)"$'\n' ;;
        idle)
            results+="$(inside idle)"$'\n'
            results+="$(inside idle-baseline --no-visor)"$'\n'
            ;;
        memory)
            results+="$(inside memory)"$'\n'
            results+="$(inside memory-baseline --no-visor)"$'\n'
            ;;
        *) echo "unknown part: $part" >&2; exit 2 ;;
    esac
done
printf '%s' "$results" >"$repo/.shell-test/measure.raw"

verdict() { awk -v v="$1" -v limit="$2" 'BEGIN { print (v + 0 < limit + 0) ? "met" : "NOT MET" }'; }
row() { printf '| %-34s | %-12s | %-52s | %-8s |\n' "$@"; }

echo
echo "Machine: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs), $(nproc) threads, $(gnome-shell --version), headless, virtual monitor 1920x1080"
echo
row "What" "Budget" "Measured" "Result"
row "---" "---" "---" "---"
for part in "${parts[@]}"; do
    case "$part" in
        enable)
            read -r median min max n <<<"$(value enable)"
            row "enable()" "< 5 ms" "median $median ms (min $min, max $max, n=$n)" "$(verdict "$median" 5)"
            ;;
        frames)
            for state in open idle; do
                line="$(value "frames-$state")"
                get() { grep -o "$1=[^=]*\( \|$\)" <<<"$line " | sed "s/^$1=//; s/ [a-z-]*$//; s/ *$//" | head -n 1; }
                name=$([[ $state == open ]] && echo "open" || echo "close")
                read -r imax_median imax_worst <<<"$(get interval-max)"
                read -r umax_median umax_worst <<<"$(get update-max)"
                read -r vmax_median vmax_worst <<<"$(get visor-max)"
                row "$name: frame interval" "16.7 ms, no drop" "mean $(get interval-mean) ms, worst $imax_worst ms, $(get dropped) of $(get frames) frames > 25 ms ($(get runs) runs)" "$(verdict "$(get dropped)" 1)"
                row "$name: main-loop work per frame" "< 8 ms" "mean $(get update-mean) ms, worst frame: median $umax_median ms, max $umax_worst ms" "$(verdict "$umax_worst" 8)"
                row "$name: of that in Visor's handler" "" "worst frame: median $vmax_median ms, max $vmax_worst ms" ""
                read -r median min max n <<<"$(value "enter-$state")"
                row "$name: work before the first frame" "< 8 ms" "median $median ms, max $max ms (n=$n)" "$(verdict "$median" 8)"
            done
            read -r first_enter first_frame <<<"$(value first-open)"
            row "first open after enable (once)" "" "$first_enter ms before the first frame, worst frame $first_frame ms" ""
            ;;
        search)
            read -r median min max n <<<"$(value search-local)"
            row "search: local results in the list" "< 16 ms" "median $median ms, max $max ms (n=$n)" "$(verdict "$max" 16)"
            read -r median min max n <<<"$(value search-frame-begins)"
            row "search: wait for the next frame" "" "median $median ms, max $max ms" ""
            read -r median min max n <<<"$(value search-layout)"
            row "search: style and layout of that frame" "" "median $median ms, max $max ms" ""
            read -r median min max n <<<"$(value search-paint)"
            row "search: paint of that frame" "" "median $median ms, max $max ms" ""
            read -r median min max n <<<"$(value search-painted)"
            row "search: on screen after the debounce" "" "median $median ms, max $max ms" ""
            ;;
        idle)
            with="$(value idle-wakeups)" without="$(value idle-baseline-wakeups)"
            own="$(value idle-visor-own)" handlers="$(value idle-visor-handlers)"
            row "idle: Visor's own sources fired, ${idle_seconds} s" "0" "$own (timeouts, idle sources, D-Bus signals)" "$(verdict "$own" 1)"
            row "idle: signal handlers of Visor run" "" "$handlers (listed below)" ""
            row "idle: wakeups of the shell, ${idle_seconds} s" "no more" "$with with Visor, $without without" ""
            echo "  what ran while idle: $(value idle-visor-sources)"
            ;;
        memory)
            read -r rss0 pss0 <<<"$(value memory-start)"
            read -r rss1 pss1 <<<"$(value memory-used-once)"
            read -r rss2 pss2 <<<"$(value memory-end)"
            read -r brss0 bpss0 <<<"$(value memory-baseline-start)"
            read -r brss2 bpss2 <<<"$(value memory-baseline-end)"
            mb() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.1f", (a - b) / 1024 }'; }
            row "memory: shell with Visor vs. without" "< 15 MB" "RSS +$(mb "$rss2" "$brss2") MB, anonymous +$(mb "$pss2" "$bpss2") MB after $cycles cycles and $cycles queries" "$(verdict "$(mb "$rss2" "$brss2")" 15)"
            read -r brss1 bpss1 <<<"$(value memory-baseline-used-once)"
            row "memory: the same use without Visor" "" "RSS $(mb "$brss2" "$brss1") MB, anonymous $(mb "$bpss2" "$bpss1") MB (date menu, overview search)" ""
            row "memory: growth over those cycles" "" "RSS $(mb "$rss2" "$rss1") MB, anonymous $(mb "$pss2" "$pss1") MB (after first use → end)" ""
            row "memory: at start, with vs. without" "" "RSS +$(mb "$rss0" "$brss0") MB" ""
            ;;
    esac
done
