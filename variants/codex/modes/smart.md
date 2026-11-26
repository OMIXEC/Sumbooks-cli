# Mode: smart (ledger compatibility check)

Default mode. Before running anything, check the local ledger for this task's domain:

- Ledger shows a recorded `hit` → skip `sumbooks-librarian`; spawn a single
  `sumbooks-item-reader` against the book that hit.
- Ledger shows a `miss` with `missStreak` below 3 → skip the library entirely for this
  task; nothing fit recently and re-checking every task wastes cycles.
- Ledger shows a `miss` with `missStreak` at 3 or more, or no entry at all → run
  `sumbooks-librarian` fresh, then one `sumbooks-item-reader` per angle in parallel,
  and record whatever it finds back into the ledger.

The ledger is a plain file inside the library directory, so when the library is shared
with a team (e.g. checked into git), the ledger — and the research history it
represents — is shared along with it automatically.
