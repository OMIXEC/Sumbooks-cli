import fs from "node:fs";
import path from "node:path";

export function resolveLibraryRoot(cliFlag?: string): string {
  const root = cliFlag || process.env.SUMBOOKS_LIBRARY || "./sumbooks";
  return path.resolve(root);
}

export interface LibPaths {
  root: string;
  dataDir: string;
  dbFile: string;
  pagesDir: string;
  historyDir: string;
  ledgerFile: string;
  requestsFile: string;
  configFile: string;
  booksDir: string;
  shelvesFile: string;
  teamFile: string;
  bookGapsFile: string;
  tourEventsFile: string;
  sessionFile: string;
  catalogFile: string;
}

export function libPaths(root: string): LibPaths {
  const dataDir = path.join(root, ".sumbooks");
  return {
    root,
    dataDir,
    dbFile: path.join(dataDir, "index.db"),
    pagesDir: path.join(dataDir, "pages"),
    historyDir: path.join(dataDir, "history"),
    ledgerFile: path.join(dataDir, "ledger.json"),
    requestsFile: path.join(dataDir, "requests.json"),
    configFile: path.join(dataDir, "config.json"),
    booksDir: path.join(root, "books"),
    shelvesFile: path.join(dataDir, "shelves.json"),
    teamFile: path.join(dataDir, "team.json"),
    bookGapsFile: path.join(dataDir, "book-gaps.json"),
    tourEventsFile: path.join(dataDir, "tour-events.json"),
    sessionFile: path.join(dataDir, "session"),
    catalogFile: path.join(dataDir, "catalog.json"),
  };
}

export function ensureLibLayout(p: LibPaths): void {
  for (const dir of [p.root, p.dataDir, p.pagesDir, p.historyDir, p.booksDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function pageFile(p: LibPaths, id: string, page: number): string {
  return path.join(p.pagesDir, id, `${page}.txt`);
}

export function itemPagesDir(p: LibPaths, id: string): string {
  return path.join(p.pagesDir, id);
}

export function itemHistoryDir(p: LibPaths, id: string): string {
  return path.join(p.historyDir, id);
}

export function versionDir(p: LibPaths, id: string, version: number): string {
  return path.join(itemHistoryDir(p, id), String(version));
}

export function manifestFile(p: LibPaths, id: string): string {
  return path.join(itemHistoryDir(p, id), "manifest.json");
}
