import { describe, it, expect } from "vitest";
import { checkExpectedVersion } from "../src/versioncheck.js";

describe("checkExpectedVersion", () => {
  it("passes when expected matches current", () => {
    expect(checkExpectedVersion(3, 3)).toEqual({ ok: true });
  });

  it("fails with VERSION_CONFLICT message when stale", () => {
    const result = checkExpectedVersion(2, 1);
    expect(result.ok).toBe(false);
    expect(result.message).toBe("VERSION_CONFLICT: expected 1, current is 2");
  });
});
