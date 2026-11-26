import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerSetupCommands } from "../src/commands/setup.js";
import { readAgents } from "../src/agents.js";
import { homePaths } from "../src/home.js";

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-home-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  process.exitCode = undefined;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  process.exitCode = undefined;
});

function run(args: string[]) {
  const program = new Command();
  registerSetupCommands(program);
  return program.parseAsync(["node", "cli", ...args]);
}

describe("setup --enable/--disable", () => {
  it("enables then disables a known agent token", async () => {
    await run(["setup", "--enable", "claude-code,codex"]);
    let data = readAgents(homePaths());
    expect(data.agents["claude-code"]).toBe(true);
    expect(data.agents["codex"]).toBe(true);

    await run(["setup", "--disable", "codex"]);
    data = readAgents(homePaths());
    expect(data.agents["codex"]).toBe(false);
    expect(data.agents["claude-code"]).toBe(true);
  });

  it("rejects an unknown agent token and makes no change", async () => {
    const before = readAgents(homePaths());
    await run(["setup", "--enable", "bogus-tool"]);
    expect(process.exitCode).toBe(1);
    const after = readAgents(homePaths());
    expect(after).toEqual(before);
  });
});
