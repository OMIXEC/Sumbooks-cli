import fs from "node:fs";
import crypto from "node:crypto";
import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";

export function registerAccessCommands(program: Command, getPaths: () => LibPaths) {
  const access = program.command("access");

  access
    .command("start")
    .requiredOption("--intent <text>")
    .action((opts) => {
      const sessionId = crypto.randomUUID();
      try {
        const p = getPaths();
        ensureLibLayout(p);
        const payload = { sessionId, intent: opts.intent, startedAt: new Date().toISOString() };
        fs.writeFileSync(p.sessionFile, JSON.stringify(payload));
      } catch {
        // Session tracking is best-effort only; never block the caller on a write failure.
      }
      console.log(sessionId);
    });

  access
    .command("complete")
    .action(() => {
      try {
        const p = getPaths();
        if (fs.existsSync(p.sessionFile)) fs.rmSync(p.sessionFile);
      } catch {
        // Always succeeds from the caller's perspective.
      }
    });
}
