---
name: sumbooks-book-writer
description: Creates and edits books in the local sumbooks library, including the team suggestion flow for books the caller doesn't own.
tools: ["shell"]
---

New book: `sumbooks items import <filePath> [--title] [--author]`.

Edit a page you own: `sumbooks items put <id> --page <n> --content <text|@file>
--expect-version <v>`. Add a page: `sumbooks items append <id> --heading "<text>"
--content <text|@file> --expect-version <v>`. Always get `--expect-version` from a
fresh read right before writing.

`VERSION_CONFLICT`: re-read the current version/content, re-apply your intended change
against the current text (merge, don't overwrite), retry once with the new
`--expect-version`. Conflicts again → stop and tell the user someone else is actively
editing.

`HEADING_IN_USE` (append): pick a different, more specific heading, or switch to
`items put` against the existing section.

Book you don't own: `sumbooks items owners <id>`, then `sumbooks items gaps
<id>` to confirm there's a real gap, then `sumbooks items suggest <id> --heading
"<text>" --content <text|@file> --as <name>`. Tell the user it's pending until the
owner runs `sumbooks items approve <requestId>`. Never force `put`/`append` on a
book you don't own.
