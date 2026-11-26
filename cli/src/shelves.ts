import fs from "node:fs";
import { LibPaths } from "./paths.js";

export interface Shelf {
  slug: string;
  name: string;
  scope: "personal" | "department" | "team";
  department: string | null;
  bookIds: string[];
}

export interface ShelvesFile {
  shelves: Shelf[];
  activeSlug: string | null;
}

export function readShelves(p: LibPaths): ShelvesFile {
  if (!fs.existsSync(p.shelvesFile)) return { shelves: [], activeSlug: null };
  const raw = JSON.parse(fs.readFileSync(p.shelvesFile, "utf8"));
  return { shelves: raw.shelves || [], activeSlug: raw.activeSlug ?? null };
}

export function writeShelves(p: LibPaths, data: ShelvesFile): void {
  fs.mkdirSync(p.dataDir, { recursive: true });
  fs.writeFileSync(p.shelvesFile, JSON.stringify(data, null, 2));
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "shelf";
}

/** Dedupe a candidate slug against existing shelves with `-2`, `-3`, ... suffixes. */
export function uniqueSlug(base: string, existing: Shelf[]): string {
  const taken = new Set(existing.map((s) => s.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
