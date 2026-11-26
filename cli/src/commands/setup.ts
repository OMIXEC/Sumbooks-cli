import { Command } from "commander";
import { homePaths } from "../home.js";
import { readAgents, writeAgents, VALID_AGENTS } from "../agents.js";

function printUnknownAgentsError(unknown: string[]) {
  console.error(`Error: unknown agent(s): ${unknown.join(", ")}. Valid agents: ${VALID_AGENTS.join(", ")}`);
}

export function registerSetupCommands(program: Command) {
  program
    .command("setup")
    .option("--status", "print current coding-agent setup preferences")
    .option("--list", "list valid agent tokens and their current enabled state")
    .option("--enable <agents>", "comma-separated agent tokens to enable")
    .option("--disable <agents>", 'comma-separated agent tokens to disable, or "all"')
    .option("--json")
    .action((opts) => {
      const h = homePaths();

      if (opts.enable) {
        const tokens = opts.enable.split(",").map((s: string) => s.trim());
        const unknown = tokens.filter((t: string) => !(VALID_AGENTS as readonly string[]).includes(t));
        if (unknown.length > 0) {
          printUnknownAgentsError(unknown);
          process.exitCode = 1;
          return;
        }
        const data = readAgents(h);
        for (const t of tokens) data.agents[t] = true;
        writeAgents(h, data);
        console.log(`Enabled: ${tokens.join(", ")}. This only records a local preference flag — it does not install anything.`);
        return;
      }

      if (opts.disable) {
        const data = readAgents(h);
        if (opts.disable === "all") {
          for (const t of VALID_AGENTS) data.agents[t] = false;
          writeAgents(h, data);
          console.log("Disabled all agents.");
          return;
        }
        const tokens = opts.disable.split(",").map((s: string) => s.trim());
        const unknown = tokens.filter((t: string) => !(VALID_AGENTS as readonly string[]).includes(t));
        if (unknown.length > 0) {
          printUnknownAgentsError(unknown);
          process.exitCode = 1;
          return;
        }
        for (const t of tokens) data.agents[t] = false;
        writeAgents(h, data);
        console.log(`Disabled: ${tokens.join(", ")}.`);
        return;
      }

      // --status and --list both just report current state; default to --status's view.
      const data = readAgents(h);
      const rows = VALID_AGENTS.map((t) => ({ agent: t, enabled: data.agents[t] === true }));
      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      for (const r of rows) console.log(`${r.agent} | ${r.enabled ? "enabled" : "disabled"}`);
      if (!opts.status && !opts.list) {
        console.log("(no flag given; showing current status — use --enable/--disable to change it)");
      }
    });
}
