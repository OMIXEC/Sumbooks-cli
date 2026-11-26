import fs from "node:fs";
import { LibPaths } from "./paths.js";

export interface DomainEntry {
  outcome: "hit" | "miss";
  bookId: string | null;
  title: string | null;
  lastRecordedAt: string;
  missStreak: number;
  missCooldownUntil: string | null;
}

export interface GapEntry {
  intent: string;
  category: string;
  subcategory: string;
  suggestedTitle: string | null;
  suggestedAuthor: string | null;
  domain: string;
  recordedAt: string;
}

export interface Ledger {
  domains: Record<string, DomainEntry>;
  gaps: GapEntry[];
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export function readLedger(p: LibPaths): Ledger {
  if (!fs.existsSync(p.ledgerFile)) return { domains: {}, gaps: [] };
  const raw = JSON.parse(fs.readFileSync(p.ledgerFile, "utf8"));
  return { domains: raw.domains || {}, gaps: raw.gaps || [] };
}

export function writeLedger(p: LibPaths, ledger: Ledger): void {
  fs.mkdirSync(p.dataDir, { recursive: true });
  fs.writeFileSync(p.ledgerFile, JSON.stringify(ledger, null, 2));
}

export function recordHit(p: LibPaths, domain: string, bookId: string | null, title: string | null): Ledger {
  const ledger = readLedger(p);
  const key = normalizeDomain(domain);
  ledger.domains[key] = {
    outcome: "hit",
    bookId,
    title,
    lastRecordedAt: new Date().toISOString(),
    missStreak: 0,
    missCooldownUntil: null,
  };
  writeLedger(p, ledger);
  return ledger;
}

export function recordGap(
  p: LibPaths,
  gap: Omit<GapEntry, "recordedAt">
): Ledger {
  const ledger = readLedger(p);
  const key = normalizeDomain(gap.domain);
  const recordedAt = new Date().toISOString();
  ledger.gaps.push({ ...gap, recordedAt });
  const existing = ledger.domains[key];
  const missStreak = existing && existing.outcome === "miss" ? existing.missStreak + 1 : 1;
  ledger.domains[key] = {
    outcome: "miss",
    bookId: existing?.bookId ?? null,
    title: existing?.title ?? null,
    lastRecordedAt: recordedAt,
    missStreak,
    missCooldownUntil: null,
  };
  writeLedger(p, ledger);
  return ledger;
}
