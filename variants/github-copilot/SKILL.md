---
name: sumbooks-dev (GitHub Copilot adapter)
description: Maps the sumbooks-dev librarian → reader → writer pipeline onto GitHub Copilot's native custom-agent mechanism.
---

# GitHub Copilot adapter

Copilot picks up custom agents from `.agent.md` files (markdown with YAML frontmatter,
same shape as Claude Code's `agents/*.md`). The four files in
`variants/github-copilot/agents/` — `sumbooks-librarian.agent.md`,
`sumbooks-item-reader.agent.md`, `sumbooks-book-writer.agent.md`, and
`sumbooks-book-enricher.agent.md` — carry the same responsibilities as the Claude Code
agents in `../../agents/`, written in Copilot's own frontmatter conventions.

The orchestration rules that don't belong inside any single agent — run the librarian
before readers, read one angle per reader in parallel, check the ledger before
re-running the librarian, browse before subscribing, never show raw commands to the
user — live in `AGENTS.fragment.md`. Merge that fragment into your repository's
`AGENTS.md` (or `.github/copilot-instructions.md`, depending on how your Copilot setup
is configured) so it applies as standing project instructions.

Choose a run mode from `modes/`:

- `modes/always.md` — run the pipeline on every non-trivial task automatically.
- `modes/smart.md` — the ledger-based compatibility check (recommended default).
- `modes/ask.md` — only run on an explicit research question from the user.
