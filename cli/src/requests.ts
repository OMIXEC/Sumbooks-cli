import fs from "node:fs";
import crypto from "node:crypto";
import { LibPaths } from "./paths.js";

export interface RequestEntry {
  id: string;
  bookId: string;
  heading: string;
  content: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "applied" | "declined";
  declineReason?: string;
  approveNote?: string;
}

export function readRequests(p: LibPaths): RequestEntry[] {
  if (!fs.existsSync(p.requestsFile)) return [];
  return JSON.parse(fs.readFileSync(p.requestsFile, "utf8"));
}

export function writeRequests(p: LibPaths, requests: RequestEntry[]): void {
  fs.mkdirSync(p.dataDir, { recursive: true });
  fs.writeFileSync(p.requestsFile, JSON.stringify(requests, null, 2));
}

export function addRequest(
  p: LibPaths,
  req: Omit<RequestEntry, "id" | "requestedAt" | "status">
): RequestEntry {
  const requests = readRequests(p);
  const entry: RequestEntry = {
    ...req,
    id: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
    status: "pending",
  };
  requests.push(entry);
  writeRequests(p, requests);
  return entry;
}
