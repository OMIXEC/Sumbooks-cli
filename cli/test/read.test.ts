import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { libPaths, ensureLibLayout, pageFile, itemPagesDir } from "../src/paths.js";
import { buildReadOutput, parsePageRange, parseReadSpec, MAX_READ_BYTES, MAX_PAGES_PER_CALL } from "../src/read.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-read-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("parsePageRange / parseReadSpec", () => {
  it("parses ranges and lists", () => {
    expect(parsePageRange("1-3")).toEqual([1, 2, 3]);
    expect(parsePageRange("1,4,7")).toEqual([1, 4, 7]);
  });

  it("parses multi-id specs", () => {
    expect(parseReadSpec("abc:1-2,def:5")).toEqual([
      { id: "abc", pages: [1, 2] },
      { id: "def", pages: [5] },
    ]);
  });
});

describe("buildReadOutput 20,000-byte pagination", () => {
  it("truncates at the last full page boundary and reports a resumable Stopped line", () => {
    const p = libPaths(tmpRoot);
    ensureLibLayout(p);
    const id = "book1";
    fs.mkdirSync(itemPagesDir(p, id), { recursive: true });
    // Each page is ~9000 bytes; 3 pages exceed the 20,000-byte budget, so the 3rd should be deferred.
    const bigPage = "x".repeat(9000);
    for (let i = 1; i <= 3; i++) {
      fs.writeFileSync(pageFile(p, id, i), bigPage, "utf8");
    }

    const { text, stoppedAt } = buildReadOutput(p, [{ id, pages: [1, 2, 3] }], 1);

    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(MAX_READ_BYTES);
    expect(stoppedAt).toEqual({ id, page: 3 });
    expect(text).toContain("--- Page 1 ---");
    expect(text).toContain("--- Page 2 ---");
    expect(text).not.toContain("--- Page 3 ---");
  });

  it("caps at 50 pages per call even when under the byte budget", () => {
    const p = libPaths(tmpRoot);
    ensureLibLayout(p);
    const id = "book2";
    fs.mkdirSync(itemPagesDir(p, id), { recursive: true });
    const pages = Array.from({ length: 60 }, (_, i) => i + 1);
    for (const n of pages) {
      fs.writeFileSync(pageFile(p, id, n), "short", "utf8");
    }

    const { stoppedAt } = buildReadOutput(p, [{ id, pages }], 1);
    expect(stoppedAt).toEqual({ id, page: 50 });
    expect(MAX_PAGES_PER_CALL).toBe(50);
  });
});
