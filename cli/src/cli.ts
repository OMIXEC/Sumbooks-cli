#!/usr/bin/env node
import { Command } from "commander";
import { resolveLibraryRoot, libPaths, LibPaths } from "./paths.js";
import { registerItemsCommands } from "./commands/items.js";
import { registerMarketplaceCommands } from "./commands/marketplace.js";
import { registerLibrarianCommands } from "./commands/librarian.js";
import { registerMiscCommands } from "./commands/misc.js";
import { readPackageVersion } from "./util.js";

const program = new Command();
program
  .name("sumbooks-dev")
  .description("Local, offline CLI for managing a personal/team library of PDF and markdown documents.")
  .version(readPackageVersion(), "-V, --cli-version")
  .option("--library <path>", "library root (overrides SUMBOOKS_LIBRARY)")
  .option("--catalog <path>", "marketplace catalog file (overrides SUMBOOKS_CATALOG)");

function getPaths(): LibPaths {
  const opts = program.opts();
  const root = resolveLibraryRoot(opts.library);
  return libPaths(root);
}

registerItemsCommands(program, getPaths);
registerMarketplaceCommands(program, getPaths, () => program.opts().catalog);
registerLibrarianCommands(program, getPaths);
registerMiscCommands(program, getPaths);

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
