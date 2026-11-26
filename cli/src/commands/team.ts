import fs from "node:fs";
import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { openDb, listItems } from "../db.js";
import { gitUserName } from "../util.js";
import {
  readTeam,
  writeTeam,
  slugifyDept,
  uniqueDeptSlug,
  TeamMember,
  Department,
} from "../team.js";

export function registerTeamCommands(program: Command, getPaths: () => LibPaths) {
  const team = program.command("team");

  // Bare `team` keeps the original reporting-only behavior: scan every item's
  // owners and print book/page counts per owner.
  team.action(() => {
    const p = getPaths();
    ensureLibLayout(p);
    const db = openDb(p);
    const all = listItems(db);
    const counts = new Map<string, { books: number; pages: number }>();
    for (const it of all) {
      let owners: string[] = [];
      try {
        owners = JSON.parse(it.owners_json || "[]");
      } catch {
        owners = [];
      }
      for (const owner of owners) {
        const entry = counts.get(owner) ?? { books: 0, pages: 0 };
        entry.books += 1;
        entry.pages += it.page_count;
        counts.set(owner, entry);
      }
    }
    if (counts.size === 0) {
      console.log("No owners recorded yet.");
      return;
    }
    for (const [name, c] of counts) {
      console.log(`${name} | ${c.books} book(s) | ${c.pages} page(s)`);
    }
  });

  team
    .command("show")
    .option("--mine", "filter to the current identity's memberships/departments")
    .option("--json")
    .option("--as <name>")
    .action((opts) => {
      const p = getPaths();
      const data = readTeam(p);
      let out = data;
      if (opts.mine) {
        const identity = opts.as || gitUserName();
        out = {
          members: data.members.filter((m) => m.name === identity),
          departments: data.departments.filter((d) => d.memberNames.includes(identity)),
          accessGrants: data.accessGrants,
        };
      }
      if (opts.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      console.log("Members:");
      for (const m of out.members) console.log(`  ${m.name} | ${m.role} | ${m.status}`);
      if (out.members.length === 0) console.log("  (none)");
      console.log("Departments:");
      for (const d of out.departments) console.log(`  ${d.slug} | ${d.name} | ${d.memberNames.join(", ")}`);
      if (out.departments.length === 0) console.log("  (none)");
    });

  team
    .command("invite")
    .argument("<name>")
    .option("--role <role>", "owner|admin|member", "member")
    .action((name, opts) => {
      if (!["owner", "admin", "member"].includes(opts.role)) {
        console.error("Error: --role must be one of owner|admin|member");
        process.exitCode = 1;
        return;
      }
      const p = getPaths();
      ensureLibLayout(p);
      const data = readTeam(p);
      if (data.members.some((m) => m.name === name)) {
        console.error(`Error: ${name} is already a team member`);
        process.exitCode = 1;
        return;
      }
      const entry: TeamMember = { name, role: opts.role, status: "pending" };
      data.members.push(entry);
      writeTeam(p, data);
      console.log(`Invited ${name} as ${opts.role} (recorded locally as pending).`);
      console.log(
        "Note: this only records local team metadata — it does NOT send any email or notification. " +
          "There is no account system, so tell this teammate directly (e.g. share the repo URL)."
      );
    });

  team
    .command("remove")
    .argument("<name>")
    .option("--confirm", "actually remove; without this, only previews")
    .action((name, opts) => {
      const p = getPaths();
      const data = readTeam(p);
      const member = data.members.find((m) => m.name === name);
      if (!member) {
        console.error(`Error: no team member named "${name}"`);
        process.exitCode = 1;
        return;
      }
      const depts = data.departments.filter((d) => d.memberNames.includes(name));
      if (!opts.confirm) {
        console.log(
          `Would remove ${name} (${member.role}) from members, and from ${depts.length} department(s): ` +
            `${depts.map((d) => d.slug).join(", ") || "(none)"}. Books are never deleted. Re-run with --confirm to remove.`
        );
        return;
      }
      data.members = data.members.filter((m) => m.name !== name);
      for (const d of data.departments) d.memberNames = d.memberNames.filter((n) => n !== name);
      writeTeam(p, data);
      console.log(`Removed ${name} from members and ${depts.length} department(s). Books were not touched.`);
    });

  team
    .command("delete")
    .option("--confirm", "actually clear team.json; without this, only previews")
    .action((opts) => {
      const p = getPaths();
      const data = readTeam(p);
      if (!opts.confirm) {
        console.log(
          `Would clear ${data.members.length} member(s), ${data.departments.length} department(s), and ` +
            `${Object.keys(data.accessGrants).length} access grant(s). Books are never deleted. Re-run with --confirm to clear.`
        );
        return;
      }
      writeTeam(p, { members: [], departments: [], accessGrants: {} });
      console.log("Cleared team.json. Books were not touched.");
    });

  const departments = team.command("departments");

  departments
    .command("create")
    .argument("<name>")
    .action((name) => {
      const p = getPaths();
      ensureLibLayout(p);
      const data = readTeam(p);
      const slug = uniqueDeptSlug(slugifyDept(name), data.departments);
      const dept: Department = { slug, name, memberNames: [] };
      data.departments.push(dept);
      writeTeam(p, data);
      console.log(`Created department ${slug} ("${name}").`);
    });

  departments
    .command("list")
    .option("--json")
    .action((opts) => {
      const p = getPaths();
      const data = readTeam(p);
      if (opts.json) {
        console.log(JSON.stringify(data.departments, null, 2));
        return;
      }
      if (data.departments.length === 0) {
        console.log("No departments yet.");
        return;
      }
      for (const d of data.departments) console.log(`${d.slug} | ${d.name} | ${d.memberNames.join(", ")}`);
    });

  departments
    .command("rename")
    .argument("<slug>")
    .argument("<name>")
    .action((slug, name) => {
      const p = getPaths();
      const data = readTeam(p);
      const dept = data.departments.find((d) => d.slug === slug);
      if (!dept) {
        console.error(`Error: no department with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      dept.name = name;
      writeTeam(p, data);
      console.log(`Renamed department ${slug} to "${name}".`);
    });

  departments
    .command("delete")
    .argument("<slug>")
    .option("--confirm", "actually delete; without this, only previews")
    .action((slug, opts) => {
      const p = getPaths();
      const data = readTeam(p);
      const dept = data.departments.find((d) => d.slug === slug);
      if (!dept) {
        console.error(`Error: no department with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      if (!opts.confirm) {
        console.log(`Would delete department ${slug} ("${dept.name}") with ${dept.memberNames.length} member(s). Re-run with --confirm to delete.`);
        return;
      }
      data.departments = data.departments.filter((d) => d.slug !== slug);
      for (const grant of Object.values(data.accessGrants)) {
        grant.departmentSlugs = grant.departmentSlugs.filter((s) => s !== slug);
      }
      writeTeam(p, data);
      console.log(`Deleted department ${slug}.`);
    });

  departments
    .command("add-member")
    .argument("<slug>")
    .argument("<name>")
    .action((slug, name) => {
      const p = getPaths();
      const data = readTeam(p);
      const dept = data.departments.find((d) => d.slug === slug);
      if (!dept) {
        console.error(`Error: no department with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      if (!dept.memberNames.includes(name)) dept.memberNames.push(name);
      writeTeam(p, data);
      console.log(`Added ${name} to department ${slug}.`);
    });

  departments
    .command("remove-member")
    .argument("<slug>")
    .argument("<name>")
    .action((slug, name) => {
      const p = getPaths();
      const data = readTeam(p);
      const dept = data.departments.find((d) => d.slug === slug);
      if (!dept) {
        console.error(`Error: no department with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      dept.memberNames = dept.memberNames.filter((n) => n !== name);
      writeTeam(p, data);
      console.log(`Removed ${name} from department ${slug}.`);
    });

  const access = team.command("access");

  access
    .command("grant")
    .argument("<itemId>")
    .option("--dept <slug>", "department slug (repeatable)", (val: string, prev: string[]) => (prev ? [...prev, val] : [val]), [] as string[])
    .option("--team-wide", "grant team-wide access instead of per-department")
    .action((itemId, opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const data = readTeam(p);
      const existing = data.accessGrants[itemId] ?? { departmentSlugs: [], teamWide: false };
      const deptSlugs = new Set(existing.departmentSlugs);
      for (const d of opts.dept as string[]) deptSlugs.add(d);
      data.accessGrants[itemId] = {
        departmentSlugs: Array.from(deptSlugs),
        teamWide: existing.teamWide || !!opts.teamWide,
      };
      writeTeam(p, data);
      console.log(`Granted access to ${itemId}: departments [${Array.from(deptSlugs).join(", ")}], teamWide=${data.accessGrants[itemId].teamWide}.`);
    });

  access
    .command("revoke")
    .argument("<itemId>")
    .option("--confirm", "actually revoke; without this, only previews")
    .action((itemId, opts) => {
      const p = getPaths();
      const data = readTeam(p);
      if (!data.accessGrants[itemId]) {
        console.log(`No access grant recorded for ${itemId}.`);
        return;
      }
      if (!opts.confirm) {
        console.log(`Would revoke access grant for ${itemId}. Re-run with --confirm to revoke.`);
        return;
      }
      delete data.accessGrants[itemId];
      writeTeam(p, data);
      console.log(`Revoked access grant for ${itemId}.`);
    });

  access
    .command("scope")
    .argument("<itemId>")
    .option("--dept <slug>")
    .option("--team-wide")
    .action((itemId, opts) => {
      if (!opts.dept && !opts.teamWide) {
        console.error("Error: pass either --dept <slug> or --team-wide");
        process.exitCode = 1;
        return;
      }
      const p = getPaths();
      ensureLibLayout(p);
      const data = readTeam(p);
      data.accessGrants[itemId] = opts.teamWide
        ? { departmentSlugs: [], teamWide: true }
        : { departmentSlugs: [opts.dept], teamWide: false };
      writeTeam(p, data);
      console.log(`Scoped ${itemId} to ${opts.teamWide ? "team-wide" : `department "${opts.dept}"`}.`);
    });

  access
    .command("list")
    .option("--json")
    .action((opts) => {
      const p = getPaths();
      const data = readTeam(p);
      if (opts.json) {
        console.log(JSON.stringify(data.accessGrants, null, 2));
        return;
      }
      const entries = Object.entries(data.accessGrants);
      if (entries.length === 0) {
        console.log("No access grants recorded.");
        return;
      }
      for (const [itemId, grant] of entries) {
        console.log(`${itemId} | departments: ${grant.departmentSlugs.join(", ") || "(none)"} | teamWide: ${grant.teamWide}`);
      }
    });

  access
    .command("matrix")
    .option("--json")
    .action((opts) => {
      const p = getPaths();
      const data = readTeam(p);
      const matrix: Record<string, { departments: string[]; teamWide: boolean }> = {};
      for (const [itemId, grant] of Object.entries(data.accessGrants)) {
        matrix[itemId] = { departments: grant.departmentSlugs, teamWide: grant.teamWide };
      }
      if (opts.json) {
        console.log(JSON.stringify(matrix, null, 2));
        return;
      }
      const deptSlugs = data.departments.map((d) => d.slug);
      console.log(`item | ${deptSlugs.join(" | ")} | team-wide`);
      for (const [itemId, cell] of Object.entries(matrix)) {
        const row = deptSlugs.map((s) => (cell.departments.includes(s) ? "x" : "")).join(" | ");
        console.log(`${itemId} | ${row} | ${cell.teamWide ? "x" : ""}`);
      }
    });

  team
    .command("setup")
    .argument("<file>", "JSON file describing members/departments/access to create in bulk")
    .option("--apply", "actually apply the changes; without this, only previews")
    .action((file, opts) => {
      const p = getPaths();
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        console.error(`Error: could not read/parse ${file} as JSON: ${(e as Error).message}`);
        process.exitCode = 1;
        return;
      }
      const spec = raw as {
        members?: { name: string; role?: string }[];
        departments?: { name: string; members?: string[] }[];
        access?: { itemId: string; departments?: string[]; teamWide?: boolean }[];
      };
      const errors: string[] = [];
      for (const m of spec.members ?? []) {
        if (!m.name) errors.push("member entry missing 'name'");
        if (m.role && !["owner", "admin", "member"].includes(m.role)) {
          errors.push(`member "${m.name}" has invalid role "${m.role}" (must be owner|admin|member)`);
        }
      }
      for (const d of spec.departments ?? []) {
        if (!d.name) errors.push("department entry missing 'name'");
      }
      for (const a of spec.access ?? []) {
        if (!a.itemId) errors.push("access entry missing 'itemId'");
      }

      const memberCount = spec.members?.length ?? 0;
      const deptCount = spec.departments?.length ?? 0;
      const accessCount = spec.access?.length ?? 0;
      console.log(`Summary: ${memberCount} member(s), ${deptCount} department(s), ${accessCount} access grant(s) to create.`);
      if (errors.length > 0) {
        console.log("Validation errors:");
        for (const err of errors) console.log(`  - ${err}`);
      }
      if (!opts.apply) return;
      if (errors.length > 0) {
        console.error("Error: refusing to --apply because the preview had validation errors.");
        process.exitCode = 1;
        return;
      }

      ensureLibLayout(p);
      const data = readTeam(p);
      for (const m of spec.members ?? []) {
        if (!data.members.some((existing) => existing.name === m.name)) {
          data.members.push({ name: m.name, role: (m.role as TeamMember["role"]) ?? "member", status: "pending" });
        }
      }
      for (const d of spec.departments ?? []) {
        const slug = uniqueDeptSlug(slugifyDept(d.name), data.departments);
        data.departments.push({ slug, name: d.name, memberNames: d.members ?? [] });
      }
      for (const a of spec.access ?? []) {
        data.accessGrants[a.itemId] = { departmentSlugs: a.departments ?? [], teamWide: !!a.teamWide };
      }
      writeTeam(p, data);
      console.log("Applied team setup.");
    });
}
