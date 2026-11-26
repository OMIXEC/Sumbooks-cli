# sumbooks

A fully local, offline, no-auth, no-payment CLI for managing a personal or team
library of PDF and markdown documents — built so a coding agent (Claude Code
and friends) can look things up page by page, edit them with version safety,
browse a local "marketplace" catalog, and keep a ledger of what was useful.

Zero network calls, ever, except an explicit opt-in update check (`sumbooks update`,
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
npm install -g sumbooks
```

## Storage model

Everything lives under a library root, `./sumbooks/` by default. Override it
with `SUMBOOKS_LIBRARY=<path>` or `--library <path>` on any command.

```
<library>/
  books/                         # original source files copied in by marketplace subscribe
  .sumbooks/
    index.db                     # SQLite index (better-sqlite3), table `items`
    pages/<id>/<page>.txt        # one file per page, extracted at import time
    history/<id>/<version>/      # page-file snapshots, one per past version
    history/<id>/manifest.json   # [{version, timestamp, changedPages}]
    ledger.json                  # domain hit/miss ledger + reported gaps
    requests.json                # pending/applied/declined team chapter-suggestion requests
    catalog.json                 # default local publish target for `marketplace publish/edit/unpublish`
    shelves.json                 # personal/department/team shelves + active shelf
    team.json                    # local team members, departments, access grants
    book-gaps.json               # per-item gap reports (from `items report-gap`)
    tour-events.json             # purely local tour event log (opt out: SUMBOOKS_NO_TOUR_LOG=1)
    session                      # plain text: current `access start`/`access complete` session
    config.json                  # optional, minimal
```

Home-scoped storage (tool preferences, not library data), under `~/.sumbooks/`:

```
~/.sumbooks/
  agents.json              # coding-agent setup preferences (see `setup`)
  reports.json             # bug/feature reports from `report`
  declined-books.txt       # one id per line; managed directly by the calling agent via shell, not this CLI
  uninstall-feedback.json  # optional free-text feedback from `uninstall --reason-stdin`, never sent anywhere
```

`items` table columns: `id, title, author, page_count, health, shelves,
source_path, description, toc_json, version, imported_at, owners_json,
source_listing_id`.

### What's gitignored vs. shareable

`.gitignore` excludes `node_modules/`, `dist/`, `.sumbooks/index.db`, and
`.sumbooks/pages/` — these are regenerable local caches. It does **not**
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
- `items history <id> --diff <version>` — instead of listing versions, prints
  a unified-diff-style, page-by-page comparison of that version's snapshotted
  pages against the current pages (prefix/suffix-trimmed line diff, `-`/`+`
  prefixed; no diff dependency). Errors if no snapshot exists for that
  version.
- `items restore <id> --version <v>` — copies that version's page snapshot
  back as current content; this is itself recorded as a new version (not a
  rewind).
- `items reprocess <id>` — re-runs extraction from the item's stored
  `source_path`, overwriting pages as a new version.
- `items flag <id> --health <ok|needs-review|error>` — sets health.
- `items enrich <id> [--title] [--author] [--description] [--toc <json-file>] [--tag <t>]` —
  directly updates metadata, no extraction involved. `--tag` appends to the
  item's `shelves` array, which doubles as its tag/category list (used by
  `marketplace publish`'s completeness check).
- `items owners <id>` — prints the stored `owners` array as JSON.
- `items suggest <id> --heading "<text>" --content <text|@file> --as <name>` —
  for a book you don't want to edit directly, appends a pending entry to
  `requests.json` instead of writing a page.
- `items gaps <id>` — lists pending requests for a book.
- `items gaps <id> --claim "<subcategory>" [--as <name>]` — instead of
  listing requests, marks matching `book-gaps.json` entries for that item +
  subcategory with `claimedBy` (git config name, or `--as`).
- `items report-gap --item <id> --intent "<text>" --category <c> --subcategory <sc> [--section <s>]` —
  distinct from `librarian report-gap` (which is library-wide): appends an
  entry to `book-gaps.json` for one specific item. Fire-and-forget: always
  exits 0, even if `--item` doesn't exist.
- `items dismiss-gap <bookId> --subcategory "<text>"` — removes matching
  entries from `book-gaps.json` for that item + subcategory.
- `items resolve-gap <gapId> --subcategory "<text>"` — marks a matching
  `book-gaps.json` entry (by id + subcategory) resolved, adding `resolvedAt`.
- `items decline <requestId> --reason "<text>"` — marks a pending request
  `status: "declined"` with a `declineReason`.
- `items review [--sent] [--json] [--as <name>]` — lists pending requests.
  By default shows requests waiting on the current identity (pending
  requests *not* authored by them); `--sent` shows pending requests the
  current identity authored instead. Identity is `--as`, else
  `git config user.name`.
- `items suggestion <requestId> [--json]` — prints the full stored request
  (heading, content, requestedBy, status, decline reason if any) so an agent
  can show it to the user before approve/decline.
- `items approve <requestId> [--note <text>]` — applies a pending request's
  content via the same logic as `append` (new page, new version, snapshot
  first) and marks the request `status: "applied"`. No confirm-token — this
  is a local tool with no CSRF-style concern. `--note` is optional and is
  just recorded alongside the approval.

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

- `marketplace publish <id>` — runs local completeness checks on the item
  (title, a description of at least 20 characters, an author, and at least
  one tag/category set via `items enrich <id> --tag <t>`). Prints one line
  per missing/weak field with the exact `enrich` command to fix it (a
  "Next:" line) and exits 1 if anything is missing — nothing is written. When
  all checks pass, directly appends/updates the entry (keyed by the item's
  id as `listingId`) in the resolved catalog file and exits 0. The resolved
  file is `--catalog`/`SUMBOOKS_CATALOG` if set, else the library's own
  `.sumbooks/catalog.json` — **never** the bundled read-only
  `assets/default-catalog.json`. This is an instant local publish to your
  own/your team's catalog: there's no legal rights-review queue; if you're
  adding genuinely third-party content, that's your team's own judgment to
  make.
- `marketplace edit <id> --category <c> --tag <t>` — updates the catalog
  entry's `category`/`tags` fields in the same resolved catalog file.
- `marketplace unpublish <id>` — removes the entry from the resolved catalog
  file. Does not delete the book from the library.

### librarian

- `librarian ledger record --domain <d> --outcome hit --book <id> --title <t>` —
  upserts a "hit" entry for the normalized domain in `ledger.json`
  (`missStreak` reset to 0).
- `librarian report-gap --intent <text> --category <c> --subcategory <sc> [--suggested-title <t>] [--suggested-author <a>] --domain <d>` —
  appends a gap entry and marks that domain as a "miss", incrementing
  `missStreak`. The CLI only tracks the counter faithfully; interpreting
  `missStreak` (e.g. "treat `missStreak < 3` as within cooldown") is left to
  the reading agent, not this tool.

### access (session tracking, local only)

- `access start --intent "<text>"` — writes `{sessionId, intent, startedAt}`
  to `.sumbooks/session` and prints the session id. Best-effort: never
  fails or blocks, even if the write itself fails.
- `access complete` — deletes that session file if present. Always succeeds.

### auth

- `auth whoami` — always prints `Signed in as local-user (no authentication
  required).` and exits 0. Kept, like `login`, purely for flag/behavior
  compatibility — there is no account system.

### shelf

`.sumbooks/shelves.json` holds personal/department/team shelves plus an
active shelf slug.

- `shelf list [--json]` / `shelf current` — list all shelves, or print the
  active one (`"No active shelf."` if none).
- `shelf use <slug>` / `shelf use --clear` — set or clear the active shelf.
- `shelf create "<name>" [--department "<name>"] [--team]` — generates a
  kebab-case slug from the name, deduping collisions with `-2`, `-3`, ...
  Scope is `team` if `--team`, else `department` if `--department`, else
  `personal`.
- `shelf add <slug> <itemId>` / `shelf remove <slug> <itemId>` — add/remove a
  book from a shelf.
- `shelf delete <slug> [--confirm]` — without `--confirm`, prints the book
  count that would be removed and exits 0 without changing anything; with
  `--confirm`, deletes.

### team

`.sumbooks/team.json` holds local, no-email, no-account team metadata:
members, departments, and per-item access grants.

- `team` (bare) — unchanged from before: scans every item's `owners` field
  and prints `<name> | <N book(s)> | <N page(s)>` per owner.
- `team show [--mine] [--json]` — prints members and departments from
  `team.json`; `--mine` filters to the current identity's memberships.
- `team invite <name> [--role admin]` — adds `{name, role, status: "pending"}`
  to `members`. **This only records local team metadata — it does NOT send
  any email or notification.** There's no account system, so tell that
  teammate directly (e.g. share the repo URL).
- `team remove <name> [--confirm]` — preview-then-confirm (same pattern as
  `shelf delete`); removing a member never deletes books, just updates
  `members`/`departments` references. `team delete [--confirm]` clears
  `team.json` back to empty, same preview-then-confirm pattern.
- `team departments create "<name>"` / `list` / `rename <slug> "<name>"` /
  `delete <slug> [--confirm]` / `add-member <slug> <name>` /
  `remove-member <slug> <name>`.
- `team access grant <itemId> [--dept <slug>]... | [--team-wide]` /
  `revoke <itemId> [--confirm]` / `scope <itemId> --dept <slug> | --team-wide` /
  `list [--json]` / `matrix [--json]` (cross-tab of items × departments/team-wide)
  — manages `accessGrants` keyed by item id.
- `team setup <file> [--apply]` — reads a **JSON** file (chosen over YAML to
  avoid a new dependency for a bulk-setup command) describing
  `members`/`departments`/`access` to create in bulk. Without `--apply`,
  only prints a `Summary:` line of what would change plus any validation
  errors, and changes nothing. Refuses `--apply` if the preview had errors.

### setup (coding-agent integration preference)

`~/.sumbooks/agents.json` records which coding agents you've told the
tool you use — valid tokens: `claude-code`, `cursor`, `github-copilot`,
`gemini-cli`, `codex`, `grok`.

- `setup --status [--json]` / `--list [--json]` — print current preferences.
- `setup --enable <agent>[,<agent>...]` / `--disable <agent>[,<agent>...]|all`
  — unknown agent tokens exit non-zero and print the valid list, with no
  change made.
- **This only records a local preference flag — it does not actually
  copy/symlink the plugin into that tool.** Real installation is still the
  manual step described earlier in this README.

### uninstall / report

- `uninstall [--yes] [--reason-stdin]` — removes `~/.sumbooks/agents.json`
  (setup preferences) only; **never** touches `<library>/.sumbooks/` —
  books are the user's data, not tool config. Without `--yes`, prints what
  would be removed and exits 0. With `--reason-stdin`, reads a reason off
  stdin and appends it with a timestamp to
  `~/.sumbooks/uninstall-feedback.json` — purely local, never sent
  anywhere.
- `report --type bug|feature --title "<t>" (--body "<b>" | --body-file <path> | --body -)` —
  appends `{type, title, body, recordedAt}` to `~/.sumbooks/reports.json`,
  then prints a pointer to open a GitHub issue, since this is open-source.

### tour (local-only, no analytics server)

- `tour context [--json]` — returns `{version: 2, project: {stack, knowledge: null}, library: {itemCount}}`.
  `stack` is a best-effort guess from `package.json`/`Cargo.toml`/`pyproject.toml`/`go.mod`
  in the current directory, or `null`. No account/team/trial/tier fields —
  there is no account system.
- `tour event <name> [--meta '<json>']` — appends `{name, meta, at}` to
  `.sumbooks/tour-events.json`, unless `SUMBOOKS_NO_TOUR_LOG=1` is set (a
  no-op then). Always exits 0 — this is a purely local log, never
  transmitted anywhere.
- `tour done` — minimal marker command; prints nothing, exits 0.

### misc

- `login` — always prints `Signed in as local-user (no authentication
  required).` and exits 0.
- `update [--offline]` — prints the installed version from `package.json`.
  Unless `--offline` or `SUMBOOKS_OFFLINE=1` is set, also does one optional
  `fetch` against the npm registry to check for a newer version; if the
  network is unavailable it silently skips the check and never fails.
- `reindex` — rebuilds `index.db` from `<library>/books/` (plus any
  `.sumbooks/<id>.json` sidecar metadata files, if present) and
  regenerates the page-text cache. Use this after a fresh `git clone` of a
  shared library, since `index.db` and the page cache are gitignored.

## Differences from the upstream-inspired commercial product

This CLI reimplements the *local-only behavioral contract* of a closed-source
commercial product, with deliberate simplifications since there's no server,
no accounts, and no payments here:

- No confirm-tokens on `items approve` or anywhere else — a local tool has no
  CSRF-style concern.
- `team invite` never sends email or any notification; it only records local
  JSON. Telling the teammate is on you.
- `setup --enable/--disable` only flips a local preference flag; it never
  installs, copies, or symlinks anything into another tool.
- `marketplace publish` has no legal rights-review queue — it's an instant
  local publish, and third-party content judgment calls are the team's own.
- `tour event` and `report`/`uninstall --reason-stdin` logs are purely local
  files and are never transmitted anywhere.

## Team-sharing patterns

Three ways teams can share a `sumbooks/` library, in order of preference:

1. **Shared git repo (recommended default).** Commit `books/`, `ledger.json`,
   `requests.json`, and any custom catalog file. Don't commit `index.db` or
   `pages/` — they're regenerable local caches (`.gitignore` already excludes
   them). After `git clone` or `git pull`, run `sumbooks reindex` to
   rebuild them. History snapshots and manifests are plain files too, so
   `git log` on `.sumbooks/history/<id>/manifest.json` doubles as an audit
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
marketplace catalog merge (bundled + user file, user wins), the
20,000-byte / 50-page read-pagination truncation logic, shelf
create/add/delete (preview vs. `--confirm`), team departments
create/add-member and access grant/revoke (preview vs. `--confirm`), `setup`
enable/disable with unknown-token rejection, `marketplace publish`
completeness-check pass/fail, and `tour event`'s `SUMBOOKS_NO_TOUR_LOG=1`
opt-out.

## License

MIT — see `LICENSE`.
