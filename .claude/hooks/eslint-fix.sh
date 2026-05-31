#!/usr/bin/env bash
#
# eslint-fix.sh — Claude Code PostToolUse hook
#
# After Edit/Write/MultiEdit, runs `eslint --fix` on the SINGLE edited file so
# auto-fixable problems are corrected silently and the agent does not spend
# tokens re-applying them by hand.
#
# AUTO-FIX ONLY: never blocks, never reports residual (non-autofixable) errors.
# Forcing the agent to fix unrelated lint in any file it touches contradicts the
# surgical-changes principle. Type-correctness is gated by the Stop hook
# (tsc-check.sh); full lint stays a manual/CI concern (`pnpm lint`).
#
# Contract (PostToolUse): receives the tool-call JSON on stdin; the edited path
# lives at tool_input.file_path.
#
# Fail-open: if node or the local eslint binary is missing, or the path is not a
# TS/TSX file inside the project, the hook exits 0 and the edit proceeds.

payload="$(cat)"

case "$payload" in
  *file_path*) ;;
  *) exit 0 ;;
esac

file="$(FX_PAYLOAD="$payload" node -e '
  const raw = process.env.FX_PAYLOAD || "";
  let j;
  try { j = JSON.parse(raw); } catch (e) { process.exit(0); }
  const p = (j.tool_input && j.tool_input.file_path) || "";
  process.stdout.write(String(p));
')"

case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

[ -f "$file" ] || exit 0

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"

case "$file" in
  "$project_dir"/*) ;;
  *) exit 0 ;;
esac

eslint_bin="$project_dir/node_modules/.bin/eslint"
[ -x "$eslint_bin" ] || exit 0

"$eslint_bin" --fix "$file" >/dev/null 2>&1 || true

exit 0
