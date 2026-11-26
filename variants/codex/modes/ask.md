# Mode: ask

Only touch the library when the user explicitly asks a research question — "what does
my library say about X", "check my notes on Y", or similar. Otherwise proceed with
coding/design tasks without consulting the library at all; no ledger check, no
automatic librarian call.

When the user does ask, run the full pipeline in the foreground
(`sumbooks-librarian` then `sumbooks-item-reader` per angle) and answer with inline
`(Book Title, p. N)` citations for every claim the books actually support.

Use this mode when the library is sparse, rarely relevant to the kind of work in this
project, or when the user wants full control over when it's consulted.
