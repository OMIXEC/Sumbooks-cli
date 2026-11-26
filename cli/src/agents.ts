import fs from "node:fs";
import { HomePaths, ensureHomeDir } from "./home.js";

export const VALID_AGENTS = ["claude-code", "cursor", "github-copilot", "gemini-cli", "codex", "grok"] as const;
export type AgentToken = (typeof VALID_AGENTS)[number];

export interface AgentsFile {
  agents: Record<string, boolean>;
}

export function readAgents(h: HomePaths): AgentsFile {
  if (!fs.existsSync(h.agentsFile)) return { agents: {} };
  const raw = JSON.parse(fs.readFileSync(h.agentsFile, "utf8"));
  return { agents: raw.agents || {} };
}

export function writeAgents(h: HomePaths, data: AgentsFile): void {
  ensureHomeDir(h);
  fs.writeFileSync(h.agentsFile, JSON.stringify(data, null, 2));
}
