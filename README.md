# sumbooks-dev

A fully local, offline, no-auth, no-payment CLI for managing a personal or team
library of PDF and markdown documents — built so a coding agent (Claude Code
and friends) can look things up page by page, edit them with version safety,
browse a local "marketplace" catalog, and keep a ledger of what was useful.

Zero network calls, ever, except an explicit opt-in update check (`sumbooks-dev update`,
off by default) and an explicit opt-in marketplace fetch (`--allow-network`).
No telemetry, no license checks, no accounts.

## Install

Not published to npm. To use it locally:

```bash
git clone <this repo>
cd sumbooks-cli
npm install
npm run build
npm link   # or: node dist/cli.js ...
```

If it were published, the intended install would be:

```bash
npm install -g sumbooks-dev
```

## Storage model

Everything lives under a library root, `./sumbooks/` by default. Override it
with `SUMBOOKS_LIBRARY=<path>` or `--library <path>` on any command.

```
<library>/
  books/                         # original source files copied in by marketplace subscribe
  .sumbooks-dev/
    index.db                     # SQLite index (better-sqlite3), table `items`
    pages/<id>/<page>.txt        # one file per page, extracted at import time
    history/<id>/<version>/      # page-file snapshots, one per past version
    history/<id>/manifest.json   # [{version, timestamp, changedPages}]
    ledger.json                  # domain hit/miss ledger + reported gaps
    requests.json                # pending/applied team chapter-suggestion requests
    config.json                  # optional, minimal
```

`items` table columns: `id, title, author, page_count, health, shelves,
source_path, description, toc_json, version, imported_at, owners_json,
source_listing_id`.

### What's gitignored vs. shareable

`.gitignore` excludes `node_modules/`, `dist/`, `.sumbooks-dev/index.db`, and
`.sumbooks-dev/pages/` — these are regenerable local caches. It does **not**
exclude `ledger.json`, `requests.json`, or a user catalog file — those are
meant to be committed and shared.

## Command reference

Global flags (any command): `--library <path>`, `--catalog <path>`.

### items

- `items list [--compact] [--json] [--offset N] [--no-session]` — paginated
  listing, 20 items per page. Compact text output is two lines per item
  (`id | title | author | N p | health | shelves` then description), followed
  by `FINISHED` or `NOT FINISHED --offset <next>`. `--no-session` is accepted
  and ignored (kept for flag compatibility with scripts). `--json` returns the
  same page of items as a JSON array.
- `items toc <id1>[,<id2>,<id3>] [--json]` — prints stored table of contents
  for up to 3 ids; errors if more are given; prints "No table of contents
  available" per id if none is stored.
- `items read "<id>:<range>[,<id2>:<range2>...]" [--json]` — range is `1-3`
  or `1,4,7` (or a mix). Output is `Version: <n>` followed by
  `--- Page N ---` blocks. Capped at 50 pages per call and a 20,000-byte
  output budget; if either limit is hit, output is truncated at the last full
  page boundary and a final line is printed:
  `Stopped after page <N>. Next: items read "<id>:<nextRange>"`.
- `items import <filePath> [--title <t>] [--author <a>] [--as <name>]` —
  extracts text (PDF via `pdf-parse`, markdown by splitting on top-level `# `
  headings), writes the page cache, and inserts an `items` row at `version=1`.
  A naive TOC is derived from markdown headings (PDFs currently get no TOC —
  `pdf-parse` doesn't expose outline data in this build). Owner defaults to
  `git config user.name`, override with `--as`.
- `items put <id> --page <n> --content <text|@file> --expect-version <v>` —
  overwrites one page. Snapshots the current version into history first, then
  checks `--expect-version` against the stored version; on mismatch, exits 1
  with `VERSION_CONFLICT: expected <v>, current is <actual>` on stderr and
  writes nothing. On success, bumps the version.
- `items append <id> --heading "<text>" --content <text|@file> --expect-version <v>` —
  adds a new page at the end. Same version-conflict handling as `put`. Fails
  with `HEADING_IN_USE` if an existing page already starts with that exact
  heading text.
- `items history <id>` — lists versions as `v<n> | <timestamp> | pages
  changed: <...>`, from the manifest maintained in
  `history/<id>/manifest.json`.
- `items restore <id> --version <v>` — copies that version's page snapshot
  back as current content; this is itself recorded as a new version (not a
  rewind).
- `items reprocess <id>` — re-runs extraction from the item's stored
  `source_path`, overwriting pages as a new version.
- `items flag <id> --health <ok|needs-review|error>` — sets health.
- `items enrich <id> [--title] [--author] [--description] [--toc <json-file>]` —
  directly updates metadata, no extraction involved.
- `items owners <id>` — prints the stored `owners` array as JSON.
- `items suggest <id> --heading "<text>" --content <text|@file> --as <name>` —
  for a book you don't want to edit directly, appends a pending entry to
  `requests.json` instead of writing a page.
- `items gaps <id>` — lists pending requests for a book.
- `items approve <requestId>` — applies a pending request's content via the
  same logic as `append` (new page, new version, snapshot first) and marks
  the request `status: "applied"`.

### marketplace

- `marketplace browse [--compact] [--search <term>] [--limit N]` — lists the
  merged catalog (bundled `assets/default-catalog.json` plus any file from
  `--catalog`/`SUMBOOKS_CATALOG`, keyed by `listingId`, user entries win) as
  `listing-id | title | author | N p | Free` then description. Every listing
  is free — there is no paid tier. `--search` does a case-insensitive
  substring match over title + description.
- `marketplace subscribe <listingId> [--domain <d>] [--title <t>] [--file <path>] [--allow-network]` —
  with `--file`, copies the local file into `<library>/books/` and imports it
  using the catalog entry's metadata. With `--allow-network`, fetches the
  catalog entry's `sourceUrl` via `fetch` and imports the response. With
  neither flag, nothing is fetched: it prints the `sourceUrl` and a
  "no network, use --file or --allow-network" message, exit 0. If the listing
  was already subscribed (tracked via `source_listing_id` on the item), it
  prints a friendly "already in library" message and exits 0 instead of
  re-importing.

The bundled catalog ships 8 entries, all genuinely public-domain or
Creative-Commons-licensed texts (e.g. *Pro Git*, *Eloquent JavaScript*,
several Project Gutenberg public-domain classics) — metadata and a
`sourceUrl` only, no bundled file content.

### librarian

- `librarian ledger record --domain <d> --outcome hit --book <id> --title <t>` —
  upserts a "hit" entry for the normalized domain in `ledger.json`
  (`missStreak` reset to 0).
- `librarian report-gap --intent <text> --category <c> --subcategory <sc> [--suggested-title <t>] [--suggested-author <a>] --domain <d>` —
  appends a gap entry and marks that domain as a "miss", incrementing
  `missStreak`. The CLI only tracks the counter faithfully; interpreting
  `missStreak` (e.g. "treat `missStreak < 3` as within cooldown") is left to
  the reading agent, not this tool.

### misc

- `login` — always prints `Signed in as local-user (no authentication
  required).` and exits 0.
- `update [--offline]` — prints the installed version from `package.json`.
  Unless `--offline` or `SUMBOOKS_OFFLINE=1` is set, also does one optional
  `fetch` against the npm registry to check for a newer version; if the
  network is unavailable it silently skips the check and never fails.
- `team` — scans every item's `owners` field and prints `<name> | <N book(s)>
  | <N page(s)>` per owner. No seats/billing concept.
- `reindex` — rebuilds `index.db` from `<library>/books/` (plus any
  `.sumbooks-dev/<id>.json` sidecar metadata files, if present) and
  regenerates the page-text cache. Use this after a fresh `git clone` of a
  shared library, since `index.db` and the page cache are gitignored.

## Team-sharing patterns

Three ways teams can share a `sumbooks/` library, in order of preference:

1. **Shared git repo (recommended default).** Commit `books/`, `ledger.json`,
   `requests.json`, and any custom catalog file. Don't commit `index.db` or
   `pages/` — they're regenerable local caches (`.gitignore` already excludes
   them). After `git clone` or `git pull`, run `sumbooks-dev reindex` to
   rebuild them. History snapshots and manifests are plain files too, so
   `git log` on `.sumbooks-dev/history/<id>/manifest.json` doubles as an audit
   trail. Conflicts on `requests.json`/`ledger.json` resolve the same way any
   JSON merge conflict does — small, append-only files, so conflicts are rare
   and easy to hand-resolve.
2. **Shared network folder (NFS/SMB/Dropbox/etc.).** Works, but SQLite file
   locking over network filesystems is unreliable — two agents writing to
   `index.db` at the same time can corrupt it or silently lose a write. If you
   use this pattern, make sure only one process writes at a time (e.g. a
   single "librarian" agent), and treat `reindex` as your recovery tool if the
   index ever looks wrong.
3. **Shared catalog file only.** If you don't want a shared library at all,
   just share a `catalog.json` (via `--catalog`/`SUMBOOKS_CATALOG`) so everyone
   sees the same marketplace listings, while each person keeps their own
   local `sumbooks/` library and imports/subscribes independently.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest
```

Tests live in `test/` and cover: markdown page-splitting on `# ` headings,
`put`'s version-conflict detection, ledger `missStreak` increments, the
marketplace catalog merge (bundled + user file, user wins), and the
20,000-byte / 50-page read-pagination truncation logic.

## License

MIT — see `LICENSE`.
