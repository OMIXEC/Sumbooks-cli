import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { libPaths, LibPaths } from "../src/paths.js";
import { openDb, upsertItem, Item } from "../src/db.js";
import { registerMarketplaceCommands } from "../src/commands/marketplace.js";
import { readCatalogFile } from "../src/catalog.js";

let tmpRoot: string;
let p: LibPaths;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-publish-"));
  p = libPaths(tmpRoot);
  process.exitCode = undefined;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  process.exitCode = undefined;
});

function run(args: string[]) {
  const program = new Command();
  registerMarketplaceCommands(program, () => p, () => undefined);
  return program.parseAsync(["node", "cli", "marketplace", ...args]);
}

function baseItem(overrides: Partial<Item>): Item {
  return {
    id: "book1",
    title: "Book",
    author: null,
    page_count: 1,
    health: "ok",
    shelves: "[]",
    source_path: null,
    description: null,
    toc_json: null,
    version: 1,
    imported_at: new Date().toISOString(),
    owners_json: "[]",
    source_listing_id: null,
    ...overrides,
  };
}

describe("marketplace publish completeness checks", () => {
  it("fails and writes nothing when metadata is incomplete", async () => {
    const db = openDb(p);
    upsertItem(db, baseItem({ id: "book1" }));

    await run(["publish", "book1"]);

    expect(process.exitCode).toBe(1);
    expect(readCatalogFile(p.catalogFile)).toEqual([]);
  });

  it("publishes directly to the catalog when all checks pass", async () => {
    const db = openDb(p);
    upsertItem(
      db,
      baseItem({
        id: "book2",
        author: "Author Name",
        description: "A sufficiently long description for publishing purposes.",
        shelves: JSON.stringify(["fiction"]),
      })
    );

    await run(["publish", "book2"]);

    expect(process.exitCode).not.toBe(1);
    const entries = readCatalogFile(p.catalogFile);
    expect(entries.some((e) => e.listingId === "book2")).toBe(true);
  });
});
