import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CatalogEntry {
  listingId: string;
  title: string;
  author: string;
  pageCount: number;
  description: string;
  sourceUrl: string;
  category?: string;
  tags?: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function defaultCatalogPath(): string {
  // dist/catalog.js -> ../assets/default-catalog.json ; src/catalog.ts (ts-node/dev) -> ../assets likewise
  return path.join(__dirname, "..", "assets", "default-catalog.json");
}

/** Resolve the single catalog file that `marketplace publish/edit/unpublish` write to:
 * the explicit --catalog/SUMBOOKS_CATALOG file if set, else the library's own
 * `.sumbooks/catalog.json` (never the read-only bundled catalog shipped with the tool). */
export function catalogTargetPath(userCatalogPath: string | undefined, libraryCatalogFile: string): string {
  return userCatalogPath || process.env.SUMBOOKS_CATALOG || libraryCatalogFile;
}

export function readCatalogFile(file: string): CatalogEntry[] {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeCatalogFile(file: string, entries: CatalogEntry[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
}

export function loadCatalog(userCatalogPath?: string): CatalogEntry[] {
  const bundled: CatalogEntry[] = JSON.parse(fs.readFileSync(defaultCatalogPath(), "utf8"));
  const userPath = userCatalogPath || process.env.SUMBOOKS_CATALOG;
  const merged = new Map<string, CatalogEntry>();
  for (const e of bundled) merged.set(e.listingId, e);
  if (userPath && fs.existsSync(userPath)) {
    const user: CatalogEntry[] = JSON.parse(fs.readFileSync(userPath, "utf8"));
    for (const e of user) merged.set(e.listingId, e); // user entries override/extend bundled ones
  }
  return Array.from(merged.values());
}
