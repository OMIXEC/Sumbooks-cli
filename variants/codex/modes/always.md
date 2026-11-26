# Mode: always

Run the librarian pipeline automatically before any non-trivial coding, design, or
architecture task — no ledger check, no waiting for the user to ask. Spawn
`sumbooks-librarian`, then one `sumbooks-item-reader` per returned angle in parallel.
Fold the findings into your plan or answer with inline citations before you touch any
code.

Use this mode for small projects or short sessions where the extra librarian call per
task is cheap relative to the value of never missing a relevant book. For anything with
enough task volume that repeated librarian calls get noisy, prefer `smart.md` instead.
