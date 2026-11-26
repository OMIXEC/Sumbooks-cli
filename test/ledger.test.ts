import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { libPaths } from "../src/paths.js";
import { recordGap, recordHit } from "../src/ledger.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-ledger-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("ledger missStreak", () => {
  it("increments missStreak on consecutive misses for the same domain", () => {
    const p = libPaths(tmpRoot);
    recordGap(p, { intent: "x", category: "c", subcategory: "sc", suggestedTitle: null, suggestedAuthor: null, domain: "Rust" });
    let ledger = recordGap(p, { intent: "x", category: "c", subcategory: "sc", suggestedTitle: null, suggestedAuthor: null, domain: "rust" });
    expect(ledger.domains["rust"].missStreak).toBe(2);
    ledger = recordGap(p, { intent: "x", category: "c", subcategory: "sc", suggestedTitle: null, suggestedAuthor: null, domain: "RUST" });
    expect(ledger.domains["rust"].missStreak).toBe(3);
  });

  it("resets missStreak to 0 after a hit is recorded for the domain", () => {
    const p = libPaths(tmpRoot);
    recordGap(p, { intent: "x", category: "c", subcategory: "sc", suggestedTitle: null, suggestedAuthor: null, domain: "rust" });
    const ledger = recordHit(p, "rust", "book1", "The Rust Book");
    expect(ledger.domains["rust"].missStreak).toBe(0);
    expect(ledger.domains["rust"].outcome).toBe("hit");
  });
});
