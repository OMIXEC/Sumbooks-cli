import fs from "node:fs";
import crypto from "node:crypto";
import { LibPaths } from "./paths.js";

export interface BookGapEntry {
  id: string;
  itemId: string;
  intent: string;
  category: string;
  subcategory: string;
  section: string | null;
  recordedAt: string;
  claimedBy?: string;
  resolvedAt?: string;
}

export function readBookGaps(p: LibPaths): BookGapEntry[] {
  if (!fs.existsSync(p.bookGapsFile)) return [];
  return JSON.parse(fs.readFileSync(p.bookGapsFile, "utf8"));
}

export function writeBookGaps(p: LibPaths, entries: BookGapEntry[]): void {
  fs.mkdirSync(p.dataDir, { recursive: true });
  fs.writeFileSync(p.bookGapsFile, JSON.stringify(entries, null, 2));
}

export function addBookGap(
  p: LibPaths,
  gap: Omit<BookGapEntry, "id" | "recordedAt">
): BookGapEntry {
  const entries = readBookGaps(p);
  const entry: BookGapEntry = { ...gap, id: crypto.randomUUID(), recordedAt: new Date().toISOString() };
  entries.push(entry);
  writeBookGaps(p, entries);
  return entry;
}
