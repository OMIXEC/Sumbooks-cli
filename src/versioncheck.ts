export interface VersionCheckResult {
  ok: boolean;
  message?: string;
}

/** Shared version-conflict check used by `put`, `append`, etc. */
export function checkExpectedVersion(currentVersion: number, expectedVersion: number): VersionCheckResult {
  if (currentVersion !== expectedVersion) {
    return { ok: false, message: `VERSION_CONFLICT: expected ${expectedVersion}, current is ${currentVersion}` };
  }
  return { ok: true };
}
