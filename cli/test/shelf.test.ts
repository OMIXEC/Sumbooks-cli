import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { libPaths, LibPaths } from "../src/paths.js";
import { registerShelfCommands } from "../src/commands/shelf.js";
import { readShelves } from "../src/shelves.js";

let tmpRoot: string;
let p: LibPaths;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-shelf-"));
  p = libPaths(tmpRoot);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function run(args: string[]) {
  const program = new Command();
  registerShelfCommands(program, () => p);
  return program.parseAsync(["node", "cli", "shelf", ...args]);
}

describe("shelf create/add/delete", () => {
  it("creates a shelf with a kebab-case slug and adds a book to it", async () => {
    await run(["create", "My Reading List"]);
    const created = readShelves(p);
    expect(created.shelves[0].slug).toBe("my-reading-list");

    await run(["add", "my-reading-list", "book1"]);
    const afterAdd = readShelves(p);
    expect(afterAdd.shelves[0].bookIds).toContain("book1");
  });

  it("delete without --confirm only previews; --confirm actually deletes", async () => {
    await run(["create", "Temp"]);
    expect(readShelves(p).shelves).toHaveLength(1);

    await run(["delete", "temp"]);
    expect(readShelves(p).shelves).toHaveLength(1); // unchanged by preview

    await run(["delete", "temp", "--confirm"]);
    expect(readShelves(p).shelves).toHaveLength(0);
  });
});
