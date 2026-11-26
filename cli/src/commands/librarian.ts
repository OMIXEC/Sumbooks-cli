import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { recordHit, recordGap } from "../ledger.js";

export function registerLibrarianCommands(program: Command, getPaths: () => LibPaths) {
  const librarian = program.command("librarian");
  const ledger = librarian.command("ledger");

  ledger
    .command("record")
    .requiredOption("--domain <d>")
    .requiredOption("--outcome <hit|miss>")
    .option("--book <id>")
    .option("--title <t>")
    .action((opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      if (opts.outcome !== "hit") {
        console.error('Error: "librarian ledger record" currently supports --outcome hit; use "librarian report-gap" to record a miss.');
        process.exitCode = 1;
        return;
      }
      recordHit(p, opts.domain, opts.book ?? null, opts.title ?? null);
      console.log(`Recorded hit for domain "${opts.domain}".`);
    });

  librarian
    .command("report-gap")
    .requiredOption("--intent <text>")
    .requiredOption("--category <c>")
    .requiredOption("--subcategory <sc>")
    .option("--suggested-title <t>")
    .option("--suggested-author <a>")
    .requiredOption("--domain <d>")
    .action((opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const result = recordGap(p, {
        intent: opts.intent,
        category: opts.category,
        subcategory: opts.subcategory,
        suggestedTitle: opts.suggestedTitle ?? null,
        suggestedAuthor: opts.suggestedAuthor ?? null,
        domain: opts.domain,
      });
      const key = opts.domain.trim().toLowerCase();
      console.log(`Recorded gap for domain "${opts.domain}". missStreak is now ${result.domains[key].missStreak}.`);
    });
}
