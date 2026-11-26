import fs from "node:fs";
import { execSync } from "node:child_process";

/** Resolve a --content value that may be literal text or `@<file>` to read from disk. */
export function resolveContentArg(value: string): string {
  if (value.startsWith("@")) {
    return fs.readFileSync(value.slice(1), "utf8");
  }
  return value;
}

export function gitUserName(): string {
  try {
    const name = execSync("git config user.name", { encoding: "utf8" }).trim();
    if (name) return name;
  } catch {
    // ignore, fall through to default
  }
  return "local-user";
}

/** Read all of stdin as a trimmed UTF-8 string (used by `--body -` / `--reason-stdin`). */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

export function readPackageVersion(): string {
  // dist/util.js -> ../package.json
  const url = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(url, "utf8"));
  return pkg.version;
}
