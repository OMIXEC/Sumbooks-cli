import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { loadCatalog, catalogTargetPath, readCatalogFile, writeCatalogFile, CatalogEntry } from "../catalog.js";
import { openDb, findBySourceListingId, getItem } from "../db.js";
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

  marketplace
    .command("publish")
    .argument("<id>")
    .action((id) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const issues: string[] = [];
      if (!it.title) issues.push(`title missing. Next: sumbooks items enrich ${id} --title "<title>"`);
      if (!it.description || it.description.trim().length < 20) {
        issues.push(`description missing or too short. Next: sumbooks items enrich ${id} --description "<a longer description>"`);
      }
      if (!it.author) issues.push(`author missing. Next: sumbooks items enrich ${id} --author "<author>"`);
      const tags = safeParseJsonArray(it.shelves);
      if (tags.length === 0) issues.push(`no tag/category set. Next: sumbooks items enrich ${id} --tag "<tag>"`);

      if (issues.length > 0) {
        console.error(`INCOMPLETE_METADATA: ${id} is not ready to publish:`);
        for (const issue of issues) console.error(`  - ${issue}`);
        process.exitCode = 1;
        return;
      }

      const file = catalogTargetPath(getCatalogOverride(), p.catalogFile);
      const entries = readCatalogFile(file);
      const catalogEntry: CatalogEntry = {
        listingId: it.id,
        title: it.title,
        author: it.author ?? "",
        pageCount: it.page_count,
        description: it.description ?? "",
        sourceUrl: it.source_path ?? "",
        category: tags[0],
        tags,
      };
      const idx = entries.findIndex((e) => e.listingId === it.id);
      if (idx >= 0) entries[idx] = catalogEntry;
      else entries.push(catalogEntry);
      writeCatalogFile(file, entries);
      console.log(`Published ${id} to ${file}. This is an instant local publish to your own/your team's catalog — there's no legal rights-review queue; if you're adding genuinely third-party content, that's your team's own judgment to make.`);
    });

  marketplace
    .command("edit")
    .argument("<id>")
    .option("--category <c>")
    .option("--tag <t>")
    .action((id, opts) => {
      const p = getPaths();
      const file = catalogTargetPath(getCatalogOverride(), p.catalogFile);
      const entries = readCatalogFile(file);
      const entry = entries.find((e) => e.listingId === id);
      if (!entry) {
        console.error(`Error: no catalog entry with listing id "${id}" in ${file}`);
        process.exitCode = 1;
        return;
      }
      if (opts.category) entry.category = opts.category;
      if (opts.tag) entry.tags = Array.from(new Set([...(entry.tags ?? []), opts.tag]));
      writeCatalogFile(file, entries);
      console.log(`Updated catalog entry ${id} in ${file}.`);
    });

  marketplace
    .command("unpublish")
    .argument("<id>")
    .action((id) => {
      const p = getPaths();
      const file = catalogTargetPath(getCatalogOverride(), p.catalogFile);
      const entries = readCatalogFile(file);
      const remaining = entries.filter((e) => e.listingId !== id);
      if (remaining.length === entries.length) {
        console.log(`No catalog entry with listing id "${id}" in ${file}.`);
        return;
      }
      writeCatalogFile(file, remaining);
      console.log(`Unpublished ${id} from ${file}. The book itself was not removed from your library.`);
    });
}

function safeParseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
