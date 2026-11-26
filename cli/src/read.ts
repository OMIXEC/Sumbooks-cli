import fs from "node:fs";
import { LibPaths, pageFile } from "./paths.js";

export const MAX_READ_BYTES = 20000;
export const MAX_PAGES_PER_CALL = 50;

export interface PageSpec {
  id: string;
  pages: number[];
}

/** Parse "1-3" or "1,4,7" (or a mix "1-3,7") into a sorted, deduped page list. */
export function parsePageRange(range: string): number[] {
  const out = new Set<number>();
  for (const part of range.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)-(\d+)$/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      for (let i = start; i <= end; i++) out.add(i);
    } else {
      out.add(parseInt(trimmed, 10));
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** Parse "id1:range1,id2:range2" into per-id page specs, respecting that ':' separates id from range
 *  while ',' both separates ids and separates page numbers within a range -- so we split on the
 *  "id:" pattern explicitly rather than a naive split(','). */
export function parseReadSpec(spec: string): PageSpec[] {
  const result: PageSpec[] = [];
  const parts = spec.split(/,(?=[^:,]+:)/); // split on commas that precede an "id:" token
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx === -1) throw new Error(`Invalid read spec segment: "${part}"`);
    const id = part.slice(0, idx).trim();
    const range = part.slice(idx + 1).trim();
    result.push({ id, pages: parsePageRange(range) });
  }
  return result;
}

export interface ReadResult {
  text: string;
  stoppedAt: { id: string; page: number } | null;
}

/** Enforce the 50-page-per-call cap first, then the 20,000-byte budget, truncating at the last
 *  full page boundary. Returns combined text plus, if truncated, where reading stopped. */
export function buildReadOutput(p: LibPaths, specs: PageSpec[], version: number): ReadResult {
  const flatPages: { id: string; page: number }[] = [];
  for (const spec of specs) {
    for (const page of spec.pages) flatPages.push({ id: spec.id, page });
  }
  const capped = flatPages.slice(0, MAX_PAGES_PER_CALL);
  const cappedAtPages = flatPages.length > MAX_PAGES_PER_CALL;

  const lines: string[] = [`Version: ${version}`];
  let bytes = Buffer.byteLength(lines[0] + "\n", "utf8");
  let stoppedAt: { id: string; page: number } | null = null;

  for (let i = 0; i < capped.length; i++) {
    const { id, page } = capped[i];
    const file = pageFile(p, id, page);
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const header = `--- Page ${page} ---`;
    const block = `${header}\n${text}\n`;
    const blockBytes = Buffer.byteLength(block, "utf8");
    if (bytes + blockBytes > MAX_READ_BYTES) {
      stoppedAt = { id, page };
      break;
    }
    lines.push(block);
    bytes += blockBytes;
  }

  if (!stoppedAt && cappedAtPages) {
    stoppedAt = capped[capped.length - 1];
  }

  return { text: lines.join("\n"), stoppedAt };
}
