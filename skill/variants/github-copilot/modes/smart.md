# Mode: smart (ledger compatibility check)

Default mode. Before running anything, check the local ledger for this task's domain:

- Recorded `hit` → skip `sumbooks-librarian`; delegate to a single
  `sumbooks-item-reader` against the book that hit.
- Recorded `miss` with `missStreak` below 3 → skip the library entirely for this task.
- `miss` with `missStreak` at 3 or more, or no entry at all → run `sumbooks-librarian`
  fresh, then one `sumbooks-item-reader` per angle, and record the outcome.

The ledger is a plain file inside the library directory, so when the library is shared
with a team (checked into git, for example), the research history travels with it
automatically.
