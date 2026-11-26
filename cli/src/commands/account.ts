import fs from "node:fs";
import { Command } from "commander";
import { homePaths, ensureHomeDir } from "../home.js";
import { addReport } from "../reports.js";
import { readStdin } from "../util.js";

interface UninstallFeedbackEntry {
  reason: string;
  recordedAt: string;
}

function readUninstallFeedback(file: string): UninstallFeedbackEntry[] {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function registerAccountCommands(program: Command) {
  program
    .command("uninstall")
    .option("--yes", "actually remove the local setup preferences")
    .option("--reason-stdin", "read an uninstall reason from stdin and record it locally (never sent anywhere)")
    .action(async (opts) => {
      const h = homePaths();

      if (opts.reasonStdin) {
        const reason = await readStdin();
        ensureHomeDir(h);
        const entries = readUninstallFeedback(h.uninstallFeedbackFile);
        entries.push({ reason, recordedAt: new Date().toISOString() });
        fs.writeFileSync(h.uninstallFeedbackFile, JSON.stringify(entries, null, 2));
        console.log(`Recorded your feedback locally (never sent anywhere) to ${h.uninstallFeedbackFile}.`);
      }

      const existed = fs.existsSync(h.agentsFile);
      if (!opts.yes) {
        console.log(
          existed
            ? `Would remove ${h.agentsFile} (local setup preferences only). Your library (<library>/.sumbooks-dev/) is never touched. Re-run with --yes to actually remove it.`
            : `Nothing to remove: ${h.agentsFile} does not exist. Your library is never touched.`
        );
        return;
      }
      if (existed) {
        fs.rmSync(h.agentsFile);
        console.log(`Removed ${h.agentsFile}. Your library (<library>/.sumbooks-dev/) was not touched.`);
      } else {
        console.log(`Nothing to remove: ${h.agentsFile} does not exist.`);
      }
    });

  program
    .command("report")
    .requiredOption("--type <bug|feature>")
    .option("--title <t>")
    .option("--body <b>", 'literal text, or "-" to read from stdin')
    .option("--body-file <path>")
    .action(async (opts) => {
      if (!["bug", "feature"].includes(opts.type)) {
        console.error("Error: --type must be bug or feature");
        process.exitCode = 1;
        return;
      }
      if (!opts.title) {
        console.error("Error: --title is required");
        process.exitCode = 1;
        return;
      }
      let body: string;
      if (opts.body === "-") {
        body = await readStdin();
      } else if (opts.bodyFile) {
        body = fs.readFileSync(opts.bodyFile, "utf8");
      } else if (opts.body) {
        body = opts.body;
      } else {
        console.error('Error: one of --body "<b>", --body-file <path>, or --body - is required');
        process.exitCode = 1;
        return;
      }
      const h = homePaths();
      addReport(h, { type: opts.type, title: opts.title, body });
      console.log(
        `Saved locally to ${h.reportsFile}. Since this is open-source, consider opening an issue: ` +
          "https://github.com/OMIXEC/Sumbooks-cli/issues"
      );
    });
}
