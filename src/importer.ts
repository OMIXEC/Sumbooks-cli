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
  const absSource = path.resolve(filePath);
  if (!fs.existsSync(absSource)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const { pages, toc } = await extractFile(absSource);
  const id = opts.idOverride || crypto.randomUUID().slice(0, 8);
  writePages(p, id, pages);
  const title = opts.title || path.basename(absSource).replace(/\.(pdf|md|markdown)$/i, "");
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
  upsertItem(db, item);
  return item;
}

export function tocFromExtraction(toc: TocEntry[]): string | null {
  return toc.length > 0 ? JSON.stringify(toc) : null;
}
