import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { openDb, listItems } from "../db.js";
import { appendTourEvent } from "../tourlog.js";

function detectStack(): string | null {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) return "node";
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return "python";
  if (fs.existsSync(path.join(cwd, "go.mod"))) return "go";
  return null;
}

export function registerTourCommands(program: Command, getPaths: () => LibPaths) {
  const tour = program.command("tour");

  tour
    .command("context")
    .option("--json")
    .action((opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const db = openDb(p);
      const itemCount = listItems(db).length;
      const context = {
        version: 2,
        project: { stack: detectStack(), knowledge: null },
        library: { itemCount },
      };
      if (opts.json) {
        console.log(JSON.stringify(context, null, 2));
        return;
      }
      console.log(JSON.stringify(context));
    });

  tour
    .command("event")
    .argument("<name>")
    .option("--meta <json>")
    .action((name, opts) => {
      try {
        const p = getPaths();
        ensureLibLayout(p);
        let meta: unknown = null;
        if (opts.meta) {
          try {
            meta = JSON.parse(opts.meta);
          } catch {
            meta = opts.meta;
          }
        }
        appendTourEvent(p, name, meta);
      } catch {
        // Purely local, best-effort log; must never block the caller.
      }
    });

  tour.command("done").action(() => {
    // Minimal marker command; intentionally prints nothing.
  });
}
