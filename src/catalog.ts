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
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function defaultCatalogPath(): string {
  // dist/catalog.js -> ../assets/default-catalog.json ; src/catalog.ts (ts-node/dev) -> ../assets likewise
  return path.join(__dirname, "..", "assets", "default-catalog.json");
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
