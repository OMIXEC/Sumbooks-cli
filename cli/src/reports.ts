import fs from "node:fs";
import { HomePaths, ensureHomeDir } from "./home.js";

export interface ReportEntry {
  type: "bug" | "feature";
  title: string;
  body: string;
  recordedAt: string;
}

export function readReports(h: HomePaths): ReportEntry[] {
  if (!fs.existsSync(h.reportsFile)) return [];
  return JSON.parse(fs.readFileSync(h.reportsFile, "utf8"));
}

export function writeReports(h: HomePaths, entries: ReportEntry[]): void {
  ensureHomeDir(h);
  fs.writeFileSync(h.reportsFile, JSON.stringify(entries, null, 2));
}

export function addReport(h: HomePaths, report: Omit<ReportEntry, "recordedAt">): ReportEntry {
  const entries = readReports(h);
  const entry: ReportEntry = { ...report, recordedAt: new Date().toISOString() };
  entries.push(entry);
  writeReports(h, entries);
  return entry;
}
