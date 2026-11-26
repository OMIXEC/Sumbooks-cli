import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LibPaths } from "./paths.js";

export interface Item {
  id: string;
  title: string;
  author: string | null;
  page_count: number;
  health: string;
  shelves: string; // JSON array string
  source_path: string | null;
  description: string | null;
  toc_json: string | null;
  version: number;
  imported_at: string;
  owners_json: string; // JSON array string of owner names
  source_listing_id: string | null;
}

let dbCache: Database.Database | null = null;
let dbCachePath: string | null = null;

export function openDb(p: LibPaths): Database.Database {
  if (dbCache && dbCachePath === p.dbFile) return dbCache;
  fs.mkdirSync(p.dataDir, { recursive: true });
  const db = new Database(p.dbFile);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      title TEXT,
      author TEXT,
      page_count INTEGER,
      health TEXT,
      shelves TEXT,
      source_path TEXT,
      description TEXT,
      toc_json TEXT,
      version INTEGER,
      imported_at TEXT,
      owners_json TEXT DEFAULT '[]',
      source_listing_id TEXT
    );
  `);
  // Migration safety net for older DBs missing newer columns.
  const cols = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("owners_json")) db.exec("ALTER TABLE items ADD COLUMN owners_json TEXT DEFAULT '[]'");
  if (!names.has("source_listing_id")) db.exec("ALTER TABLE items ADD COLUMN source_listing_id TEXT");
  dbCache = db;
  dbCachePath = p.dbFile;
  return db;
}

export function getItem(db: Database.Database, id: string): Item | undefined {
  return db.prepare("SELECT * FROM items WHERE id = ?").get(id) as Item | undefined;
}

export function listItems(db: Database.Database): Item[] {
  return db.prepare("SELECT * FROM items ORDER BY imported_at ASC").all() as Item[];
}

export function upsertItem(db: Database.Database, p: LibPaths, item: Item): void {
  db.prepare(
    `INSERT INTO items (id, title, author, page_count, health, shelves, source_path, description, toc_json, version, imported_at, owners_json, source_listing_id)
     VALUES (@id, @title, @author, @page_count, @health, @shelves, @source_path, @description, @toc_json, @version, @imported_at, @owners_json, @source_listing_id)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, author=excluded.author, page_count=excluded.page_count,
       health=excluded.health, shelves=excluded.shelves, source_path=excluded.source_path,
       description=excluded.description, toc_json=excluded.toc_json, version=excluded.version,
       imported_at=excluded.imported_at, owners_json=excluded.owners_json,
       source_listing_id=excluded.source_listing_id`
  ).run(item);
  writeSidecar(p, item);
}

// `reindex` rebuilds index.db from <library>/books/ alone (after a fresh git
// clone, where index.db/pages/ are gitignored) and needs title/author/
// description/owners/etc back — those don't live in the book file itself.
// Every upsert writes this sidecar so reindex can restore full metadata,
// not just page content.
function writeSidecar(p: LibPaths, item: Item): void {
  fs.mkdirSync(p.dataDir, { recursive: true });
  const sidecarPath = path.join(p.dataDir, `${item.id}.json`);
  fs.writeFileSync(
    sidecarPath,
    JSON.stringify(
      {
        title: item.title,
        author: item.author,
        health: item.health,
        shelves: JSON.parse(item.shelves || "[]"),
        description: item.description,
        version: item.version,
        imported_at: item.imported_at,
        owners: JSON.parse(item.owners_json || "[]"),
        source_listing_id: item.source_listing_id,
      },
      null,
      2
    ),
    "utf8"
  );
}

export function findBySourceListingId(db: Database.Database, listingId: string): Item | undefined {
  return db.prepare("SELECT * FROM items WHERE source_listing_id = ?").get(listingId) as Item | undefined;
}
