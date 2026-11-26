import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { LibPaths, ensureLibLayout, pageFile, itemPagesDir } from "../paths.js";
import { openDb, getItem, listItems, upsertItem, Item } from "../db.js";
import { importFile, writePages } from "../importer.js";
import { extractFile } from "../extract.js";
import { snapshotCurrentVersion, appendManifest, restoreVersionPages, readManifest } from "../history.js";
import { resolveContentArg, gitUserName } from "../util.js";
import { parseReadSpec, buildReadOutput, PageSpec } from "../read.js";
import { addRequest, readRequests, writeRequests } from "../requests.js";
import { checkExpectedVersion } from "../versioncheck.js";

const PAGE_SIZE = 20;

export function registerItemsCommands(program: Command, getPaths: () => LibPaths) {
  const items = program.command("items");

  items
    .command("list")
    .option("--compact", "compact two-line-per-item format")
    .option("--json", "JSON array output")
    .option("--offset <n>", "pagination offset", "0")
    .option("--no-session", "accepted and ignored, kept for flag compatibility")
    .action((opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const db = openDb(p);
      const all = listItems(db);
      const offset = parseInt(opts.offset, 10) || 0;
      const page = all.slice(offset, offset + PAGE_SIZE);
      const nextOffset = offset + PAGE_SIZE;
      const finished = nextOffset >= all.length;

      if (opts.json) {
        console.log(JSON.stringify(page, null, 2));
        return;
      }
      for (const it of page) {
        const shelves = safeParseArray(it.shelves);
        console.log(`${it.id} | ${it.title} | ${it.author ?? "unknown"} | ${it.page_count} p | ${it.health} | ${shelves.join(", ")}`);
        console.log(it.description ?? "");
      }
      console.log(finished ? "FINISHED" : `NOT FINISHED --offset ${nextOffset}`);
    });

  items
    .command("toc")
    .argument("<ids>", "comma-separated item ids, up to 3")
    .option("--json", "JSON output")
    .action((idsArg, opts) => {
      const ids = idsArg.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (ids.length > 3) {
        console.error("Error: at most 3 ids may be requested per call.");
        process.exitCode = 1;
        return;
      }
      const p = getPaths();
      const db = openDb(p);
      const results: Record<string, unknown> = {};
      for (const id of ids) {
        const it = getItem(db, id);
        if (!it) {
          results[id] = "Item not found";
          continue;
        }
        results[id] = it.toc_json ? JSON.parse(it.toc_json) : "No table of contents available";
      }
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      for (const id of ids) {
        console.log(`# ${id}`);
        const r = results[id];
        console.log(typeof r === "string" ? r : JSON.stringify(r, null, 2));
      }
    });

  items
    .command("read")
    .argument("<spec>", '"<id>:<range>[,<id2>:<range2>...]"')
    .option("--json", "JSON output")
    .action((spec, opts) => {
      const p = getPaths();
      const db = openDb(p);
      let specs: PageSpec[];
      try {
        specs = parseReadSpec(spec);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exitCode = 1;
        return;
      }
      // Version: use the first id's version for the header (reads are typically single-book per call).
      const firstItem = getItem(db, specs[0].id);
      if (!firstItem) {
        console.error(`Error: item not found: ${specs[0].id}`);
        process.exitCode = 1;
        return;
      }
      const { text, stoppedAt } = buildReadOutput(p, specs, firstItem.version);
      let out = text;
      if (stoppedAt) {
        const spec2 = specs.find((s) => s.id === stoppedAt.id);
        const maxPage = spec2 ? Math.max(...spec2.pages) : stoppedAt.page;
        const nextRange = `${stoppedAt.page}-${maxPage}`;
        out += `\nStopped after page ${stoppedAt.page}. Next: items read "${stoppedAt.id}:${nextRange}"`;
      }
      if (opts.json) {
        console.log(JSON.stringify({ text: out, stoppedAt }, null, 2));
      } else {
        console.log(out);
      }
    });

  items
    .command("import")
    .argument("<filePath>", "path to a PDF or markdown file")
    .option("--title <title>")
    .option("--author <author>")
    .option("--as <name>", "owner name; defaults to git config user.name")
    .action(async (filePath, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const owner = opts.as || gitUserName();
      try {
        const item = await importFile(p, db, filePath, {
          title: opts.title,
          author: opts.author,
          owners: [owner],
        });
        console.log(`Imported ${item.id}: "${item.title}" (${item.page_count} pages, version ${item.version})`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exitCode = 1;
      }
    });

  items
    .command("put")
    .argument("<id>")
    .requiredOption("--page <n>")
    .requiredOption("--content <text>")
    .requiredOption("--expect-version <v>")
    .action((id, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const expectVersion = parseInt(opts.expectVersion, 10);
      const versionCheck = checkExpectedVersion(it.version, expectVersion);
      if (!versionCheck.ok) {
        console.error(versionCheck.message);
        process.exitCode = 1;
        return;
      }
      const pageNum = parseInt(opts.page, 10);
      const content = resolveContentArg(opts.content);

      snapshotCurrentVersion(p, id, it.version);
      fs.mkdirSync(itemPagesDir(p, id), { recursive: true });
      fs.writeFileSync(pageFile(p, id, pageNum), content, "utf8");

      const newVersion = it.version + 1;
      const updated: Item = { ...it, version: newVersion };
      upsertItem(db, updated);
      appendManifest(p, id, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [pageNum] });
      console.log(`Updated ${id} page ${pageNum}. New version: ${newVersion}`);
    });

  items
    .command("append")
    .argument("<id>")
    .requiredOption("--heading <text>")
    .requiredOption("--content <text>")
    .requiredOption("--expect-version <v>")
    .action((id, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const expectVersion = parseInt(opts.expectVersion, 10);
      const versionCheck = checkExpectedVersion(it.version, expectVersion);
      if (!versionCheck.ok) {
        console.error(versionCheck.message);
        process.exitCode = 1;
        return;
      }
      const dir = itemPagesDir(p, id);
      fs.mkdirSync(dir, { recursive: true });
      const existingPages = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".txt")) : [];
      for (const f of existingPages) {
        const text = fs.readFileSync(path.join(dir, f), "utf8");
        if (text.startsWith(opts.heading)) {
          console.error(`HEADING_IN_USE: a page already starts with "${opts.heading}"`);
          process.exitCode = 1;
          return;
        }
      }
      const content = resolveContentArg(opts.content);
      const newPageNum = existingPages.length + 1;

      snapshotCurrentVersion(p, id, it.version);
      fs.writeFileSync(pageFile(p, id, newPageNum), `${opts.heading}\n${content}`, "utf8");

      const newVersion = it.version + 1;
      const updated: Item = { ...it, version: newVersion, page_count: newPageNum };
      upsertItem(db, updated);
      appendManifest(p, id, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [newPageNum] });
      console.log(`Appended page ${newPageNum} to ${id}. New version: ${newVersion}`);
    });

  items
    .command("history")
    .argument("<id>")
    .action((id) => {
      const p = getPaths();
      const entries = readManifest(p, id);
      if (entries.length === 0) {
        console.log("No history recorded.");
        return;
      }
      for (const e of entries) {
        console.log(`v${e.version} | ${e.timestamp} | pages changed: ${e.changedPages.join(", ")}`);
      }
    });

  items
    .command("restore")
    .argument("<id>")
    .requiredOption("--version <v>")
    .action((id, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const version = parseInt(opts.version, 10);
      try {
        snapshotCurrentVersion(p, id, it.version);
        restoreVersionPages(p, id, version);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exitCode = 1;
        return;
      }
      const dir = itemPagesDir(p, id);
      const pageCount = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).length;
      const newVersion = it.version + 1;
      upsertItem(db, { ...it, version: newVersion, page_count: pageCount });
      appendManifest(p, id, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [] });
      console.log(`Restored ${id} to content from version ${version}, as new version ${newVersion}`);
    });

  items
    .command("reprocess")
    .argument("<id>")
    .action(async (id) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      if (!it.source_path || !fs.existsSync(it.source_path)) {
        console.error(`Error: source_path missing or unreadable for ${id}`);
        process.exitCode = 1;
        return;
      }
      snapshotCurrentVersion(p, id, it.version);
      const { pages, toc } = await extractFile(it.source_path);
      writePages(p, id, pages);
      const newVersion = it.version + 1;
      upsertItem(db, {
        ...it,
        version: newVersion,
        page_count: pages.length,
        toc_json: toc.length > 0 ? JSON.stringify(toc) : it.toc_json,
      });
      appendManifest(p, id, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [] });
      console.log(`Reprocessed ${id} from ${it.source_path}. New version: ${newVersion}`);
    });

  items
    .command("flag")
    .argument("<id>")
    .requiredOption("--health <ok|needs-review|error>")
    .action((id, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      if (!["ok", "needs-review", "error"].includes(opts.health)) {
        console.error(`Error: --health must be one of ok|needs-review|error`);
        process.exitCode = 1;
        return;
      }
      upsertItem(db, { ...it, health: opts.health });
      console.log(`Flagged ${id} as ${opts.health}`);
    });

  items
    .command("enrich")
    .argument("<id>")
    .option("--title <title>")
    .option("--author <author>")
    .option("--description <description>")
    .option("--toc <jsonFile>")
    .action((id, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const updated: Item = { ...it };
      if (opts.title) updated.title = opts.title;
      if (opts.author) updated.author = opts.author;
      if (opts.description) updated.description = opts.description;
      if (opts.toc) updated.toc_json = fs.readFileSync(opts.toc, "utf8");
      upsertItem(db, updated);
      console.log(`Enriched ${id}`);
    });

  items
    .command("owners")
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
      console.log(JSON.stringify(safeParseArray(it.owners_json)));
    });

  items
    .command("suggest")
    .argument("<id>")
    .requiredOption("--heading <text>")
    .requiredOption("--content <text>")
    .requiredOption("--as <name>")
    .action((id, opts) => {
      const p = getPaths();
      const db = openDb(p);
      const it = getItem(db, id);
      if (!it) {
        console.error(`Error: item not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const content = resolveContentArg(opts.content);
      const entry = addRequest(p, {
        bookId: id,
        heading: opts.heading,
        content,
        requestedBy: opts.as,
      });
      console.log(`Submitted pending request ${entry.id} for ${id}`);
    });

  items
    .command("gaps")
    .argument("<id>")
    .action((id) => {
      const p = getPaths();
      const requests = readRequests(p).filter((r) => r.bookId === id && r.status === "pending");
      if (requests.length === 0) {
        console.log("No pending requests.");
        return;
      }
      for (const r of requests) {
        console.log(`${r.id} | by ${r.requestedBy} | ${r.requestedAt} | heading: ${r.heading}`);
      }
    });

  items
    .command("approve")
    .argument("<requestId>")
    .action((requestId) => {
      const p = getPaths();
      const requests = readRequests(p);
      const entry = requests.find((r) => r.id === requestId);
      if (!entry) {
        console.error(`Error: request not found: ${requestId}`);
        process.exitCode = 1;
        return;
      }
      if (entry.status === "applied") {
        console.log(`Request ${requestId} already applied.`);
        return;
      }
      const db = openDb(p);
      const it = getItem(db, entry.bookId);
      if (!it) {
        console.error(`Error: book not found: ${entry.bookId}`);
        process.exitCode = 1;
        return;
      }
      const dir = itemPagesDir(p, entry.bookId);
      fs.mkdirSync(dir, { recursive: true });
      const existingPages = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
      snapshotCurrentVersion(p, entry.bookId, it.version);
      const newPageNum = existingPages.length + 1;
      fs.writeFileSync(pageFile(p, entry.bookId, newPageNum), `${entry.heading}\n${entry.content}`, "utf8");
      const newVersion = it.version + 1;
      upsertItem(db, { ...it, version: newVersion, page_count: newPageNum });
      appendManifest(p, entry.bookId, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [newPageNum] });
      entry.status = "applied";
      writeRequests(p, requests);
      console.log(`Approved and applied request ${requestId} to ${entry.bookId}. New version: ${newVersion}`);
    });
}

function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
