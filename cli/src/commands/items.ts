import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { LibPaths, ensureLibLayout, pageFile, itemPagesDir, versionDir } from "../paths.js";
import { openDb, getItem, listItems, upsertItem, Item } from "../db.js";
import { importFile, writePages } from "../importer.js";
import { extractFile } from "../extract.js";
import { snapshotCurrentVersion, appendManifest, restoreVersionPages, readManifest } from "../history.js";
import { resolveContentArg, gitUserName } from "../util.js";
import { parseReadSpec, buildReadOutput, PageSpec } from "../read.js";
import { addRequest, readRequests, writeRequests } from "../requests.js";
import { checkExpectedVersion } from "../versioncheck.js";
import { addBookGap, readBookGaps, writeBookGaps } from "../bookgaps.js";

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
      upsertItem(db, p, updated);
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
      upsertItem(db, p, updated);
      appendManifest(p, id, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [newPageNum] });
      console.log(`Appended page ${newPageNum} to ${id}. New version: ${newVersion}`);
    });

  items
    .command("history")
    .argument("<id>")
    .option("--diff <version>", "unified-diff-style comparison of that version's pages against current pages")
    .action((id, opts) => {
      const p = getPaths();
      if (opts.diff !== undefined) {
        const version = parseInt(opts.diff, 10);
        const oldDir = versionDir(p, id, version);
        const curDir = itemPagesDir(p, id);
        if (!fs.existsSync(oldDir)) {
          console.error(`Error: no snapshot found for version ${version} of ${id}`);
          process.exitCode = 1;
          return;
        }
        const oldFiles = fs.readdirSync(oldDir).filter((f) => f.endsWith(".txt"));
        const curFiles = fs.existsSync(curDir) ? fs.readdirSync(curDir).filter((f) => f.endsWith(".txt")) : [];
        const pages = Array.from(new Set([...oldFiles, ...curFiles])).sort(
          (a, b) => parseInt(a, 10) - parseInt(b, 10)
        );
        let anyDiff = false;
        for (const f of pages) {
          const oldPath = path.join(oldDir, f);
          const curPath = path.join(curDir, f);
          const oldText = fs.existsSync(oldPath) ? fs.readFileSync(oldPath, "utf8") : "";
          const curText = fs.existsSync(curPath) ? fs.readFileSync(curPath, "utf8") : "";
          if (oldText === curText) continue;
          anyDiff = true;
          console.log(`--- ${f} (v${version})`);
          console.log(`+++ ${f} (current)`);
          for (const line of simpleLineDiff(oldText.split("\n"), curText.split("\n"))) {
            console.log(line);
          }
        }
        if (!anyDiff) console.log("No differences.");
        return;
      }
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
      upsertItem(db, p, { ...it, version: newVersion, page_count: pageCount });
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
      upsertItem(db, p, {
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
      upsertItem(db, p, { ...it, health: opts.health });
      console.log(`Flagged ${id} as ${opts.health}`);
    });

  items
    .command("enrich")
    .argument("<id>")
    .option("--title <title>")
    .option("--author <author>")
    .option("--description <description>")
    .option("--toc <jsonFile>")
    .option("--tag <tag>", "add a tag/category (appends to the item's shelves array)")
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
      if (opts.tag) {
        const tags = safeParseArray(it.shelves);
        if (!tags.includes(opts.tag)) tags.push(opts.tag);
        updated.shelves = JSON.stringify(tags);
      }
      upsertItem(db, p, updated);
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
    .option("--claim <subcategory>", "claim matching book-gaps entries for this book+subcategory")
    .option("--as <name>", "identity to claim as; defaults to git config user.name")
    .action((id, opts) => {
      const p = getPaths();
      if (opts.claim) {
        const gaps = readBookGaps(p);
        const matches = gaps.filter((g) => g.itemId === id && g.subcategory === opts.claim);
        if (matches.length === 0) {
          console.log(`No matching gaps for ${id} / "${opts.claim}".`);
          return;
        }
        const claimant = opts.as || gitUserName();
        for (const g of matches) g.claimedBy = claimant;
        writeBookGaps(p, gaps);
        console.log(`Claimed ${matches.length} gap(s) for ${id} / "${opts.claim}" as ${claimant}.`);
        return;
      }
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
    .command("report-gap")
    .requiredOption("--item <id>", "item id the gap concerns")
    .requiredOption("--intent <text>")
    .requiredOption("--category <c>")
    .requiredOption("--subcategory <sc>")
    .option("--section <s>")
    .action((opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const entry = addBookGap(p, {
        itemId: opts.item,
        intent: opts.intent,
        category: opts.category,
        subcategory: opts.subcategory,
        section: opts.section ?? null,
      });
      console.log(`Recorded gap ${entry.id} for item ${opts.item}.`);
    });

  items
    .command("dismiss-gap")
    .argument("<bookId>")
    .requiredOption("--subcategory <text>")
    .action((bookId, opts) => {
      const p = getPaths();
      const gaps = readBookGaps(p);
      const remaining = gaps.filter((g) => !(g.itemId === bookId && g.subcategory === opts.subcategory));
      const removed = gaps.length - remaining.length;
      writeBookGaps(p, remaining);
      console.log(`Dismissed ${removed} gap(s) for ${bookId} / "${opts.subcategory}".`);
    });

  items
    .command("resolve-gap")
    .argument("<gapId>")
    .requiredOption("--subcategory <text>")
    .action((gapId, opts) => {
      const p = getPaths();
      const gaps = readBookGaps(p);
      const entry = gaps.find((g) => g.id === gapId && g.subcategory === opts.subcategory);
      if (!entry) {
        console.error(`Error: gap not found: ${gapId} with subcategory "${opts.subcategory}"`);
        process.exitCode = 1;
        return;
      }
      entry.resolvedAt = new Date().toISOString();
      writeBookGaps(p, gaps);
      console.log(`Resolved gap ${gapId}.`);
    });

  items
    .command("decline")
    .argument("<requestId>")
    .requiredOption("--reason <text>")
    .action((requestId, opts) => {
      const p = getPaths();
      const requests = readRequests(p);
      const entry = requests.find((r) => r.id === requestId);
      if (!entry) {
        console.error(`Error: request not found: ${requestId}`);
        process.exitCode = 1;
        return;
      }
      entry.status = "declined";
      entry.declineReason = opts.reason;
      writeRequests(p, requests);
      console.log(`Declined request ${requestId}: ${opts.reason}`);
    });

  items
    .command("review")
    .option("--sent", "show requests authored by the current identity instead of ones waiting on you")
    .option("--json")
    .option("--as <name>", "identity to use; defaults to git config user.name")
    .action((opts) => {
      const p = getPaths();
      const identity = opts.as || gitUserName();
      const pending = readRequests(p).filter((r) => r.status === "pending");
      const list = opts.sent
        ? pending.filter((r) => r.requestedBy === identity)
        : pending.filter((r) => r.requestedBy !== identity);
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      if (list.length === 0) {
        console.log(opts.sent ? "No pending requests sent by you." : "No pending requests waiting on you.");
        return;
      }
      for (const r of list) {
        console.log(`${r.id} | book ${r.bookId} | by ${r.requestedBy} | ${r.requestedAt} | heading: ${r.heading}`);
      }
    });

  items
    .command("suggestion")
    .argument("<requestId>")
    .option("--json")
    .action((requestId, opts) => {
      const p = getPaths();
      const entry = readRequests(p).find((r) => r.id === requestId);
      if (!entry) {
        console.error(`Error: request not found: ${requestId}`);
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }
      console.log(`Request ${entry.id} for ${entry.bookId}`);
      console.log(`Status: ${entry.status}`);
      console.log(`Requested by: ${entry.requestedBy} at ${entry.requestedAt}`);
      console.log(`Heading: ${entry.heading}`);
      console.log(`Content:\n${entry.content}`);
      if (entry.status === "declined" && entry.declineReason) {
        console.log(`Decline reason: ${entry.declineReason}`);
      }
    });

  items
    .command("approve")
    .argument("<requestId>")
    .option("--note <text>", "optional note recorded with the approval")
    .action((requestId, opts) => {
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
      upsertItem(db, p, { ...it, version: newVersion, page_count: newPageNum });
      appendManifest(p, entry.bookId, { version: newVersion, timestamp: new Date().toISOString(), changedPages: [newPageNum] });
      entry.status = "applied";
      if (opts.note) entry.approveNote = opts.note;
      writeRequests(p, requests);
      console.log(`Approved and applied request ${requestId} to ${entry.bookId}. New version: ${newVersion}`);
    });
}

/** Simple prefix/suffix-trimmed line diff: good enough for page-snapshot comparisons without a diff dependency. */
function simpleLineDiff(oldLines: string[], newLines: string[]): string[] {
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
    i++;
    j++;
  }
  let ti = oldLines.length;
  let tj = newLines.length;
  while (ti > i && tj > j && oldLines[ti - 1] === newLines[tj - 1]) {
    ti--;
    tj--;
  }
  const out: string[] = [];
  for (let k = i; k < ti; k++) out.push(`-${oldLines[k]}`);
  for (let k = j; k < tj; k++) out.push(`+${newLines[k]}`);
  return out;
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
