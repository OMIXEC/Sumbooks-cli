---
name: sumbooks-dev (Codex adapter)
description: Maps the sumbooks-dev librarian → reader → writer pipeline onto Codex's native agent-config mechanism.
---

# Codex adapter

Codex doesn't load `agents/*.md` subagents the way Claude Code does; it reads
TOML-defined agents from `variants/codex/agents/*.toml` and picks one up by name when
you invoke it as a sub-task. The four agents here (`sumbooks-librarian`,
`sumbooks-item-reader`, `sumbooks-book-writer`, `sumbooks-book-enricher`) carry the same
responsibilities as the Claude Code versions in `../../agents/`, just condensed into
each TOML file's `prompt` field since Codex agent configs are single-string prompts
rather than long-form markdown.

The orchestration logic itself — librarian first, then one reader per angle in
parallel, the ledger-based Auto Mode compatibility check, the marketplace
browse-before-subscribe rule, and the "never show raw CLI commands to the user" rule —
lives in `AGENTS.fragment.md`. Merge that fragment into your project's `AGENTS.md` so
Codex picks it up as standing instructions rather than something you have to restate
per task.

Pick a run mode from `modes/`:

- `modes/always.md` — run the librarian pipeline automatically before any non-trivial
  coding/design task.
- `modes/smart.md` — the ledger compatibility check: only run the librarian when the
  local ledger doesn't already have a fresh answer for this domain.
- `modes/ask.md` — library access only on an explicit research question from the user.

Most projects should start with `smart` — it's the same default Claude Code uses in
`SKILL.md` section 3.
