import fs from "node:fs";
import { LibPaths } from "./paths.js";

export interface TeamMember {
  name: string;
  role: "owner" | "admin" | "member";
  status: "active" | "pending";
}

export interface Department {
  slug: string;
  name: string;
  memberNames: string[];
}

export interface AccessGrant {
  departmentSlugs: string[];
  teamWide: boolean;
}

export interface TeamFile {
  members: TeamMember[];
  departments: Department[];
  accessGrants: Record<string, AccessGrant>;
}

export function readTeam(p: LibPaths): TeamFile {
  if (!fs.existsSync(p.teamFile)) return { members: [], departments: [], accessGrants: {} };
  const raw = JSON.parse(fs.readFileSync(p.teamFile, "utf8"));
  return {
    members: raw.members || [],
    departments: raw.departments || [],
    accessGrants: raw.accessGrants || {},
  };
}

export function writeTeam(p: LibPaths, data: TeamFile): void {
  fs.mkdirSync(p.dataDir, { recursive: true });
  fs.writeFileSync(p.teamFile, JSON.stringify(data, null, 2));
}

export function slugifyDept(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dept"
  );
}

export function uniqueDeptSlug(base: string, existing: Department[]): string {
  const taken = new Set(existing.map((d) => d.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
