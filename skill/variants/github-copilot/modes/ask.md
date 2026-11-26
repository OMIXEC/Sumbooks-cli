# Mode: ask

Only touch the library when the user explicitly asks a research question. Otherwise
proceed with the coding/design task without consulting the library — no ledger check,
no automatic librarian run.

When asked, run the full pipeline in the foreground (`sumbooks-librarian` then
`sumbooks-item-reader` per angle) and answer with inline `(Book Title, p. N)`
citations for every claim the books actually support.
