import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { loadCatalog } from "../catalog.js";
import { openDb, findBySourceListingId } from "../db.js";
import { importFile } from "../importer.js";
import { gitUserName } from "../util.js";

export function registerMarketplaceCommands(
  program: Command,
  getPaths: () => LibPaths,
  getCatalogOverride: () => string | undefined
) {
  const marketplace = program.command("marketplace");

  marketplace
    .command("browse")
    .option("--compact", "compact listing format")
    .option("--search <term>", "case-insensitive substring match on title+description")
    .option("--limit <n>", "limit number of results")
    .action((opts) => {
      const p = getPaths();
      let entries = loadCatalog(getCatalogOverride());
      if (opts.search) {
        const term = opts.search.toLowerCase();
        entries = entries.filter(
          (e) => e.title.toLowerCase().includes(term) || e.description.toLowerCase().includes(term)
        );
      }
      if (opts.limit) entries = entries.slice(0, parseInt(opts.limit, 10));
      for (const e of entries) {
        console.log(`${e.listingId} | ${e.title} | ${e.author} | ${e.pageCount} p | Free`);
        console.log(e.description);
      }
      void p;
    });

  marketplace
    .command("subscribe")
    .argument("<listingId>")
    .option("--domain <d>")
    .option("--title <t>")
    .option("--file <path>")
    .option("--allow-network", "fetch sourceUrl over HTTP when explicitly requested")
    .action(async (listingId, opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const catalog = loadCatalog(getCatalogOverride());
      const entry = catalog.find((e) => e.listingId === listingId);
      if (!entry) {
        console.error(`Error: no catalog entry with listing id "${listingId}"`);
        process.exitCode = 1;
        return;
      }
      const db = openDb(p);
      const already = findBySourceListingId(db, listingId);
      if (already) {
        console.log(`Already in library as "${already.title}" (${already.id}).`);
        return;
      }

      if (opts.file) {
        const destName = `${listingId}${path.extname(opts.file)}`;
        const destPath = path.join(p.booksDir, destName);
        fs.copyFileSync(opts.file, destPath);
        const item = await importFile(p, db, destPath, {
          title: opts.title || entry.title,
          author: entry.author,
          owners: [gitUserName()],
          sourceListingId: listingId,
        });
        console.log(`Subscribed "${item.title}" (${item.id}) from local file.`);
        return;
      }

      if (opts.allowNetwork) {
        if (!entry.sourceUrl) {
          console.error(`Error: catalog entry "${listingId}" has no sourceUrl to fetch.`);
          process.exitCode = 1;
          return;
        }
        try {
          const res = await fetch(entry.sourceUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = await res.text();
          const destName = `${listingId}.md`;
          const destPath = path.join(p.booksDir, destName);
          fs.writeFileSync(destPath, body, "utf8");
          const item = await importFile(p, db, destPath, {
            title: opts.title || entry.title,
            author: entry.author,
            owners: [gitUserName()],
            sourceListingId: listingId,
          });
          console.log(`Subscribed "${item.title}" (${item.id}) fetched from ${entry.sourceUrl}.`);
        } catch (e) {
          console.error(`Error: failed to fetch ${entry.sourceUrl}: ${(e as Error).message}`);
          process.exitCode = 1;
        }
        return;
      }

      console.log(`No network fetch performed. To subscribe to "${entry.title}":`);
      console.log(`  - Source: ${entry.sourceUrl}`);
      console.log(`  - Use --file <path> to import a local copy, or --allow-network to fetch it directly.`);
      console.log(`no network, use --file or --allow-network`);
    });
}
