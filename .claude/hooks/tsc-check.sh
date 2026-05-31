#!/usr/bin/env bash
#
# tsc-check.sh — Claude Code Stop hook
#
# Runs the TypeScript type-checker once when the agent finishes a turn, instead
# of invoking tsc ad-hoc several times per session. On type errors it returns
# the first lines to stderr and exits 2, so the agent keeps working until the
# project type-checks clean ("loop until green").
#
# Rozetta uses a flat tsconfig (no project references), so `tsc --noEmit` is the
# correct check (matches `pnpm exec tsc --noEmit`). The repo's tsc baseline is
# kept green, so only errors the agent itself introduces should block the turn.
#
# No stdin parsing needed (Stop carries no edited file). Fail-open if the local
# tsc binary is missing.

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
tsc_bin="$project_dir/node_modules/.bin/tsc"
[ -x "$tsc_bin" ] || exit 0

cd "$project_dir" || exit 0

out="$("$tsc_bin" --noEmit 2>&1)"
code=$?

if [ "$code" -ne 0 ]; then
  printf '%s\n' "$out" | head -40 >&2
  echo "tsc reported type errors (see above). Fix them before ending the turn." >&2
  exit 2
fi

exit 0
