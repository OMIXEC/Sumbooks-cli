import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { libPaths, LibPaths } from "../src/paths.js";
import { appendTourEvent, readTourEvents } from "../src/tourlog.js";

let tmpRoot: string;
let p: LibPaths;
let originalEnv: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sumbooks-tour-"));
  p = libPaths(tmpRoot);
  originalEnv = process.env.SUMBOOKS_NO_TOUR_LOG;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.SUMBOOKS_NO_TOUR_LOG;
  else process.env.SUMBOOKS_NO_TOUR_LOG = originalEnv;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("tour event logging opt-out", () => {
  it("logs the event by default", () => {
    delete process.env.SUMBOOKS_NO_TOUR_LOG;
    appendTourEvent(p, "test_event", { a: 1 });
    expect(readTourEvents(p)).toHaveLength(1);
  });

  it("is a no-op when SUMBOOKS_NO_TOUR_LOG=1", () => {
    process.env.SUMBOOKS_NO_TOUR_LOG = "1";
    appendTourEvent(p, "test_event", { a: 1 });
    expect(fs.existsSync(p.tourEventsFile)).toBe(false);
    expect(readTourEvents(p)).toHaveLength(0);
  });
});
