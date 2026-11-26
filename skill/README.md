# sumbooks-dev skill bundle

A plugin skill bundle that teaches an AI coding agent to consult a local, offline
library of PDF and markdown documents before — and while — it does coding, design, or
research work. It pairs with the [`sumbooks-dev`](#installing-the-cli) CLI, which
manages that library: listing books, reading page ranges, importing new ones, editing
pages with version control, browsing a local marketplace catalog, and tracking a
per-domain research ledger. Everything is local files — no accounts, no network calls,
no paid tiers, nothing to unlock.

## What's in here

- `SKILL.md` — the main orchestration skill for Claude Code: when to run the
  librarian → reader pipeline, the ledger-based "Auto Mode" for everyday tasks, the
  marketplace flow, and the authoring/maintenance flows.
- `agents/` — the four Claude Code subagents: `librarian`, `item-reader`,
  `book-writer`, `book-enricher`.
- `variants/codex/` and `variants/github-copilot/` — the same behavior ported to
  Codex's TOML agent configs and GitHub Copilot's `.agent.md` custom agents, plus an
  `AGENTS.fragment.md` to merge into each project's `AGENTS.md`.
- `.claude-plugin/plugin.json`, `bundle-metadata.json` — plugin manifest metadata.

## Installing the `sumbooks-dev` CLI

This skill assumes `sumbooks-dev` is already installed and on `PATH`. If you don't
have it yet:

```
npm install -g sumbooks-dev
```

(or follow whatever install method your platform's package manager documents — the
CLI is a standalone local tool with no server component).

## Installing the plugin

**Claude Code**: copy or symlink this directory into your plugins path (or add it as a
marketplace plugin source pointing at this repo), then enable the `sumbooks-dev`
plugin. The agents under `agents/` and the root `SKILL.md` load automatically.

**Codex**: copy `variants/codex/agents/*.toml` into your Codex agent config directory,
and merge `variants/codex/AGENTS.fragment.md` into your project's `AGENTS.md`. Pick one
of `variants/codex/modes/{always,smart,ask}.md` as your working default.

**GitHub Copilot**: copy `variants/github-copilot/agents/*.agent.md` into your
repository's Copilot custom-agent directory, and merge
`variants/github-copilot/AGENTS.fragment.md` into your `AGENTS.md` or Copilot
instructions file. Again, pick a mode from `variants/github-copilot/modes/`.

## Quickstart

Point the CLI at a folder of documents and index it:

```
export SUMBOOKS_LIBRARY=/path/to/your/pdfs-and-markdown
sumbooks-dev reindex
```

From there, ask your agent a research question ("what do my books say about X") or
just start a normal coding task — with the `smart` mode installed, the agent will
check the library automatically when it's likely to help.
