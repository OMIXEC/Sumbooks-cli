import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { openDb, listItems, upsertItem, Item } from "../db.js";
import { extractFile } from "../extract.js";
import { writePages } from "../importer.js";
import { readPackageVersion } from "../util.js";

export function registerMiscCommands(program: Command, getPaths: () => LibPaths) {
  program
    .command("login")
    .action(() => {
      console.log("Signed in as local-user (no authentication required).");
    });

  const auth = program.command("auth");
  auth
    .command("whoami")
    .action(() => {
      console.log("Signed in as local-user (no authentication required).");
    });

  program
    .command("update")
    .option("--offline", "skip the network version check")
    .action(async (opts) => {
      const version = readPackageVersion();
      console.log(`sumbooks ${version}`);
      if (opts.offline || process.env.SUMBOOKS_OFFLINE === "1") return;
      try {
        const res = await fetch("https://registry.npmjs.org/sumbooks/latest");
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (data.version && data.version !== version) {
          console.log(`A newer version is available: ${data.version} (current: ${version})`);
        }
      } catch {
        // No network, or registry unreachable: silently skip, never fail.
      }
    });

  program
    .command("reindex")
    .action(async () => {
      const p = getPaths();
      ensureLibLayout(p);
      const db = openDb(p);
      if (!fs.existsSync(p.booksDir)) {
        console.log("No books/ directory found; nothing to reindex.");
        return;
      }
      const files = fs.readdirSync(p.booksDir).filter((f) => /\.(pdf|md|markdown)$/i.test(f));
      let count = 0;
      for (const file of files) {
        const absPath = path.join(p.booksDir, file);
        const id = path.basename(file).replace(/\.(pdf|md|markdown)$/i, "");
        const sidecarPath = path.join(p.dataDir, `${id}.json`);
        const sidecar = fs.existsSync(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, "utf8")) : {};
        const { pages, toc } = await extractFile(absPath);
        writePages(p, id, pages); // regenerate the (gitignored) page cache since it isn't shared via git
        const item: Item = {
          id,
          title: sidecar.title ?? id,
          author: sidecar.author ?? null,
          page_count: pages.length,
          health: sidecar.health ?? "ok",
          shelves: JSON.stringify(sidecar.shelves ?? []),
          source_path: absPath,
          description: sidecar.description ?? null,
          toc_json: toc.length > 0 ? JSON.stringify(toc) : null,
          version: sidecar.version ?? 1,
          imported_at: sidecar.imported_at ?? new Date().toISOString(),
          owners_json: JSON.stringify(sidecar.owners ?? []),
          source_listing_id: sidecar.source_listing_id ?? null,
        };
        upsertItem(db, item);
        count += 1;
      }
      console.log(`Reindexed ${count} item(s) from ${p.booksDir}.`);
    });
}
