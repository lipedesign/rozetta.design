# Security Policy

## Supported versions

Rozetta.design is pre-1.0. Security fixes target the latest release line.

| Version | Supported |
|---|---|
| `0.1.x` | ✅ |
| `< 0.1` | ❌ |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately via GitHub's **[Security Advisories → "Report a vulnerability"](https://github.com/lipedesign/rozetta.design/security/advisories/new)**. This opens a confidential channel with the maintainers.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (or a proof of concept).
- Affected version / commit.

We aim to acknowledge reports within a few days and to coordinate a fix and disclosure timeline with you.

## Scope notes

Rozetta keeps secrets server/local-only (`.env*`, `*.local.json`, DB/service-role keys), scopes all workspace mutations through `requireWorkspaceRole`, and runs bridge/exec code with allowlisted spawn (no `shell: true`). Issues in these areas are especially in scope — see [`AGENTS.md`](./AGENTS.md).
