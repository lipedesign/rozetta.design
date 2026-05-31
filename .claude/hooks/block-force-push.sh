#!/usr/bin/env bash
#
# block-force-push.sh — Claude Code PreToolUse hook
#
# Blocks `git push` with force semantics (--force / --force-with-lease /
# --force-if-includes / -f / +refspec) before the Bash tool runs. Deterministic
# guardrail on top of the prose rule in .claude/rules/git-workflow.md
# ("never force-push main or develop") and the server-side branch protection.
#
# Contract (PreToolUse): receives the tool-call JSON on stdin; the command
# string lives at tool_input.command. To block, emit a deny decision on stdout
# and exit 2 (Claude Code hook semantics).
#
# Parser: node — present for anyone who can run this pnpm/Next.js project. The
# fast path skips spawning node unless the payload mentions "push".
#
# Fail-open: if node is missing the hook exits non-zero-non-2 (non-blocking) and
# the push proceeds — server-side GitHub branch protection is the real backstop.

payload="$(cat)"

case "$payload" in
  *push*) ;;
  *) exit 0 ;;
esac

FP_PAYLOAD="$payload" node -e '
  const raw = process.env.FP_PAYLOAD || "";
  let j;
  try { j = JSON.parse(raw); } catch (e) { process.exit(0); }
  if (j.tool_name !== "Bash") process.exit(0);

  const cmd = (j.tool_input && j.tool_input.command) || "";

  const m = cmd.match(
    /(?:^|[;&|\n(])\s*((?:\w+=\S*\s+|sudo\s+|env\s+)*git\s+(?:-C\s+\S+\s+|--\S+\s+)*push\b)/
  );
  if (!m) process.exit(0);

  const tail = cmd.slice(m.index + m[0].indexOf(m[1]));
  const seg = tail.split(/&&|\|\||[;|\n]/)[0];
  const args = seg.replace(/^.*?push\b/, "");

  const forced =
    /--force\b/.test(seg) ||
    /(?:^|\s)-[A-Za-z]*f[A-Za-z]*(?=\s|$)/.test(seg) ||
    /\s\+\S/.test(args);

  if (!forced) process.exit(0);

  const reason =
    "Force-push blocked by .claude/hooks/block-force-push.sh. Rewriting history " +
    "is prohibited on this repo — see .claude/rules/git-workflow.md. main and " +
    "develop are also protected server-side. If a force-push is genuinely " +
    "required, the human operator must run it manually outside Claude Code.";

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.stderr.write(reason + "\n");
  process.exit(2);
'
exit $?
