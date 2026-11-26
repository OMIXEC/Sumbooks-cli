import fs from "node:fs";
import path from "node:path";
import { LibPaths, itemPagesDir, versionDir, manifestFile, itemHistoryDir } from "./paths.js";

export interface ManifestEntry {
  version: number;
  timestamp: string;
  changedPages: number[];
}

export function readManifest(p: LibPaths, id: string): ManifestEntry[] {
  const f = manifestFile(p, id);
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

export function appendManifest(p: LibPaths, id: string, entry: ManifestEntry): void {
  fs.mkdirSync(itemHistoryDir(p, id), { recursive: true });
  const entries = readManifest(p, id);
  entries.push(entry);
  fs.writeFileSync(manifestFile(p, id), JSON.stringify(entries, null, 2));
}

/** Snapshot the current page files for `id` into history/<id>/<version>/ before a mutation bumps the version. */
export function snapshotCurrentVersion(p: LibPaths, id: string, currentVersion: number): void {
  const srcDir = itemPagesDir(p, id);
  const dstDir = versionDir(p, id, currentVersion);
  fs.mkdirSync(dstDir, { recursive: true });
  if (!fs.existsSync(srcDir)) return;
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
  }
}

export function restoreVersionPages(p: LibPaths, id: string, version: number): void {
  const srcDir = versionDir(p, id, version);
  const dstDir = itemPagesDir(p, id);
  if (!fs.existsSync(srcDir)) {
    throw new Error(`No snapshot found for version ${version} of ${id}`);
  }
  fs.rmSync(dstDir, { recursive: true, force: true });
  fs.mkdirSync(dstDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
  }
}
