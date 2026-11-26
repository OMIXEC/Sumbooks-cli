import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { libPaths, LibPaths } from "../src/paths.js";
import { registerTeamCommands } from "../src/commands/team.js";
import { readTeam } from "../src/team.js";

let tmpRoot: string;
let p: LibPaths;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-team-"));
  p = libPaths(tmpRoot);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function run(args: string[]) {
  const program = new Command();
  registerTeamCommands(program, () => p);
  return program.parseAsync(["node", "cli", "team", ...args]);
}

describe("team departments", () => {
  it("creates a department and adds a member to it", async () => {
    await run(["departments", "create", "Engineering"]);
    const afterCreate = readTeam(p);
    expect(afterCreate.departments[0].slug).toBe("engineering");

    await run(["departments", "add-member", "engineering", "Alice"]);
    const afterAdd = readTeam(p);
    expect(afterAdd.departments[0].memberNames).toContain("Alice");
  });
});

describe("team access grant/revoke", () => {
  it("grants access and then revokes it (preview vs --confirm)", async () => {
    await run(["access", "grant", "book1", "--dept", "eng"]);
    expect(readTeam(p).accessGrants["book1"].departmentSlugs).toContain("eng");

    await run(["access", "revoke", "book1"]); // preview only, no --confirm
    expect(readTeam(p).accessGrants["book1"]).toBeDefined();

    await run(["access", "revoke", "book1", "--confirm"]);
    expect(readTeam(p).accessGrants["book1"]).toBeUndefined();
  });
});
