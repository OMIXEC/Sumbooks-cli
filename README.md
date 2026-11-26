# sumbooks

A fully local, offline, open-source Claude Code plugin (with Codex and
GitHub Copilot ports) that lets a coding agent consult your own PDF and
markdown library — with page citations — before and during coding, design,
and research work. Backed by a CLI that indexes and manages that library.

No accounts. No server. No paid tiers. No telemetry. No license checks.
Everything lives on disk, under your control.

## Layout

This repo is both an installable Claude Code plugin and the CLI it depends
on, in one place:

```
.claude-plugin/
  plugin.json        — plugin manifest
  marketplace.json    — lets this repo be added as a plugin marketplace source
SKILL.md              — main orchestration skill (Claude Code)
agents/               — the 4 Claude Code subagents: librarian, item-reader,
                         book-writer, book-enricher
bundle-metadata.json
variants/
  codex/              — same behavior ported to Codex (.toml agents, modes,
                         AGENTS.fragment.md)
  github-copilot/     — same, ported to Copilot (.agent.md agents, modes,
                         AGENTS.fragment.md)
cli/                  — the `sumbooks` CLI (Node/TypeScript) — see
                         cli/README.md for the full command reference
```

## Install

### 1. The CLI

```bash
cd cli
npm install && npm run build && npm link
```

### 2. The plugin

**Claude Code** — add this repo as a plugin marketplace source (reads
`.claude-plugin/marketplace.json`), then enable the `sumbooks` plugin.
Or just symlink/copy this repo's root (minus `cli/`) into your plugins path —
`SKILL.md` and `agents/` load the same way either way.

**Codex** — copy `variants/codex/agents/*.toml` into your Codex agent config
directory, merge `variants/codex/AGENTS.fragment.md` into your project's
`AGENTS.md`, and pick one of `variants/codex/modes/{always,smart,ask}.md` as
your working default.

**GitHub Copilot** — copy `variants/github-copilot/agents/*.agent.md` into
your repo's Copilot custom-agent directory, merge
`variants/github-copilot/AGENTS.fragment.md` into your `AGENTS.md`/Copilot
instructions, and pick a mode from `variants/github-copilot/modes/`.

## Quickstart

```bash
export SUMBOOKS_LIBRARY=/path/to/your/pdfs-and-markdown
sumbooks reindex
sumbooks items list --compact
```

Then ask your agent a research question ("what do my books say about X") or
just start a normal coding task — the skill decides when the library is
worth checking.

## How it fits together

```
your coding agent
   │
   ├─ spawns librarian ──► sumbooks items list / marketplace browse / items toc
   │                        picks relevant books, records a ledger hit or a gap
   │
   └─ spawns item-reader(s) ──► sumbooks items read "<id>:<pages>"
                                 cites findings back to the agent, page-numbered
```

Everyday (non-research) tasks go through a cheaper path: the agent checks the
local ledger first — a recorded `hit` skips straight to a reader, a recent
`miss` skips the library entirely, and only a genuinely new topic spawns a
fresh librarian pass. Writing or editing a book goes through a `book-writer`
flow with version-conflict detection, so two edits never silently clobber
each other; a book you don't own becomes a pending suggestion instead of a
direct write.

## Team use, no server required

Point `SUMBOOKS_LIBRARY` at a git repo instead of a plain folder, commit the
books plus the ledger and request files, and `sumbooks reindex` after
each pull. See [`cli/README.md`](./cli/README.md#team-sharing-patterns) for
this and two other sharing patterns, with their tradeoffs.

## Design principles

- **Local-first.** No command makes a network call unless you explicitly
  pass a flag for it (`--allow-network` on a marketplace subscribe, or the
  opt-in version check in `update`), and both fail silently rather than
  block you if you're offline.
- **Transparent state.** The ledger, request queue, and catalog are all
  plain JSON files you can open, diff, and `git blame`.
- **No gating.** There's nothing to unlock, upgrade, or pay for — every
  book in the bundled catalog is public-domain or Creative-Commons
  licensed, and your own library has no read limits or locked items.
- **Agent-agnostic.** The CLI doesn't know or care which coding agent is
  calling it; the skill is written once and ported per-runtime.

## Status

Early, functional, tested (`npm test` in `cli/` — 12 tests covering
page-splitting, version conflicts, ledger cooldown, catalog merge, and read
pagination). Not yet published to a package registry; clone and `npm link`
for local CLI use.

## License

MIT — see `LICENSE`.
