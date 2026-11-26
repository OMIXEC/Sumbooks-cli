import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface HomePaths {
  dir: string;
  agentsFile: string;
  reportsFile: string;
  declinedBooksFile: string;
  uninstallFeedbackFile: string;
}

/** Home-scoped storage: `~/.sumbooks/*`, for tool-level (not library) preferences and local-only logs. */
export function homePaths(): HomePaths {
  const dir = path.join(os.homedir(), ".sumbooks");
  return {
    dir,
    agentsFile: path.join(dir, "agents.json"),
    reportsFile: path.join(dir, "reports.json"),
    declinedBooksFile: path.join(dir, "declined-books.txt"),
    uninstallFeedbackFile: path.join(dir, "uninstall-feedback.json"),
  };
}

export function ensureHomeDir(h: HomePaths): void {
  fs.mkdirSync(h.dir, { recursive: true });
}
