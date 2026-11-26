import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadCatalog } from "../src/catalog.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-catalog-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("marketplace catalog merge", () => {
  it("merges the bundled catalog with a user-supplied catalog file, user entries override by listingId", () => {
    const userCatalogPath = path.join(tmpRoot, "catalog.json");
    fs.writeFileSync(
      userCatalogPath,
      JSON.stringify([
        { listingId: "pro-git", title: "Pro Git (local mirror)", author: "Scott Chacon and Ben Straub", pageCount: 500, description: "overridden", sourceUrl: "https://example.com/pro-git" },
        { listingId: "my-custom-book", title: "My Custom Book", author: "Me", pageCount: 10, description: "a custom entry", sourceUrl: "https://example.com/book" },
      ])
    );

    const entries = loadCatalog(userCatalogPath);
    const bundledOnly = entries.find((e) => e.listingId === "eloquent-javascript");
    const overridden = entries.find((e) => e.listingId === "pro-git");
    const custom = entries.find((e) => e.listingId === "my-custom-book");

    expect(bundledOnly).toBeDefined();
    expect(overridden?.title).toBe("Pro Git (local mirror)");
    expect(custom).toBeDefined();
  });

  it("falls back to the bundled catalog alone when no user file is given", () => {
    const entries = loadCatalog();
    expect(entries.length).toBeGreaterThanOrEqual(6);
    expect(entries.find((e) => e.listingId === "pro-git")).toBeDefined();
  });
});
