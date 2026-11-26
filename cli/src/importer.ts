import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { LibPaths, itemPagesDir, pageFile, ensureLibLayout } from "./paths.js";
import { extractFile, TocEntry } from "./extract.js";
import { upsertItem, Item } from "./db.js";

export function writePages(p: LibPaths, id: string, pages: { text: string }[]): void {
  const dir = itemPagesDir(p, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  pages.forEach((page, idx) => {
    fs.writeFileSync(pageFile(p, id, idx + 1), page.text, "utf8");
  });
}

export interface ImportOptions {
  title?: string;
  author?: string;
  owners?: string[];
  idOverride?: string;
  sourceListingId?: string | null;
}

export async function importFile(
  p: LibPaths,
  db: Database.Database,
  filePath: string,
  opts: ImportOptions = {}
): Promise<Item> {
  ensureLibLayout(p);
  const rawSource = path.resolve(filePath);
  if (!fs.existsSync(rawSource)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const id = opts.idOverride || crypto.randomUUID().slice(0, 8);

  // Every import lands a copy in <library>/books/ so `reindex` can recover it
  // after a fresh git clone (see README "Team-sharing patterns") — not just
  // files that already arrived there via marketplace subscribe.
  fs.mkdirSync(p.booksDir, { recursive: true });
  const ext = path.extname(rawSource) || ".md";
  const destPath = path.resolve(path.join(p.booksDir, `${id}${ext}`));
  if (destPath !== rawSource) {
    fs.copyFileSync(rawSource, destPath);
  }
  const absSource = destPath;

  const { pages, toc } = await extractFile(absSource);
  writePages(p, id, pages);
  const title = opts.title || path.basename(rawSource).replace(/\.(pdf|md|markdown)$/i, "");
  const item: Item = {
    id,
    title,
    author: opts.author ?? null,
    page_count: pages.length,
    health: "ok",
    shelves: JSON.stringify([]),
    source_path: absSource,
    description: null,
    toc_json: toc.length > 0 ? JSON.stringify(toc) : null,
    version: 1,
    imported_at: new Date().toISOString(),
    owners_json: JSON.stringify(opts.owners ?? []),
    source_listing_id: opts.sourceListingId ?? null,
  };
  upsertItem(db, p, item);
  return item;
}

export function tocFromExtraction(toc: TocEntry[]): string | null {
  return toc.length > 0 ? JSON.stringify(toc) : null;
}
