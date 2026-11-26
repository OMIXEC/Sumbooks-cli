import fs from "node:fs";
import { LibPaths } from "./paths.js";

export interface TourEvent {
  name: string;
  meta: unknown;
  at: string;
}

export function readTourEvents(p: LibPaths): TourEvent[] {
  if (!fs.existsSync(p.tourEventsFile)) return [];
  return JSON.parse(fs.readFileSync(p.tourEventsFile, "utf8"));
}

export function appendTourEvent(p: LibPaths, name: string, meta: unknown): void {
  if (process.env.SUMBOOKS_NO_TOUR_LOG === "1") return;
  fs.mkdirSync(p.dataDir, { recursive: true });
  const events = readTourEvents(p);
  events.push({ name, meta, at: new Date().toISOString() });
  fs.writeFileSync(p.tourEventsFile, JSON.stringify(events, null, 2));
}
