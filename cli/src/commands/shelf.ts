import { Command } from "commander";
import { LibPaths, ensureLibLayout } from "../paths.js";
import { readShelves, writeShelves, slugify, uniqueSlug, Shelf } from "../shelves.js";

export function registerShelfCommands(program: Command, getPaths: () => LibPaths) {
  const shelf = program.command("shelf");

  shelf
    .command("list")
    .option("--json")
    .action((opts) => {
      const p = getPaths();
      const data = readShelves(p);
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      if (data.shelves.length === 0) {
        console.log("No shelves yet.");
        return;
      }
      for (const s of data.shelves) {
        const active = s.slug === data.activeSlug ? " (active)" : "";
        console.log(`${s.slug} | ${s.name} | ${s.scope}${s.department ? `/${s.department}` : ""} | ${s.bookIds.length} book(s)${active}`);
      }
    });

  shelf
    .command("current")
    .action(() => {
      const p = getPaths();
      const data = readShelves(p);
      const active = data.shelves.find((s) => s.slug === data.activeSlug);
      console.log(active ? `${active.slug} | ${active.name}` : "No active shelf.");
    });

  shelf
    .command("use")
    .argument("[slug]")
    .option("--clear", "clear the active shelf")
    .action((slug, opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const data = readShelves(p);
      if (opts.clear) {
        data.activeSlug = null;
        writeShelves(p, data);
        console.log("Cleared active shelf.");
        return;
      }
      const found = data.shelves.find((s) => s.slug === slug);
      if (!found) {
        console.error(`Error: no shelf with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      data.activeSlug = found.slug;
      writeShelves(p, data);
      console.log(`Active shelf is now ${found.slug}.`);
    });

  shelf
    .command("create")
    .argument("<name>")
    .option("--department <name>")
    .option("--team", "team-wide shelf")
    .action((name, opts) => {
      const p = getPaths();
      ensureLibLayout(p);
      const data = readShelves(p);
      const slug = uniqueSlug(slugify(name), data.shelves);
      const entry: Shelf = {
        slug,
        name,
        scope: opts.team ? "team" : opts.department ? "department" : "personal",
        department: opts.department ?? null,
        bookIds: [],
      };
      data.shelves.push(entry);
      writeShelves(p, data);
      console.log(`Created shelf ${slug} ("${name}", ${entry.scope}).`);
    });

  shelf
    .command("add")
    .argument("<slug>")
    .argument("<itemId>")
    .action((slug, itemId) => {
      const p = getPaths();
      const data = readShelves(p);
      const found = data.shelves.find((s) => s.slug === slug);
      if (!found) {
        console.error(`Error: no shelf with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      if (!found.bookIds.includes(itemId)) found.bookIds.push(itemId);
      writeShelves(p, data);
      console.log(`Added ${itemId} to shelf ${slug}.`);
    });

  shelf
    .command("remove")
    .argument("<slug>")
    .argument("<itemId>")
    .action((slug, itemId) => {
      const p = getPaths();
      const data = readShelves(p);
      const found = data.shelves.find((s) => s.slug === slug);
      if (!found) {
        console.error(`Error: no shelf with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      found.bookIds = found.bookIds.filter((id) => id !== itemId);
      writeShelves(p, data);
      console.log(`Removed ${itemId} from shelf ${slug}.`);
    });

  shelf
    .command("delete")
    .argument("<slug>")
    .option("--confirm", "actually delete; without this, only previews")
    .action((slug, opts) => {
      const p = getPaths();
      const data = readShelves(p);
      const found = data.shelves.find((s) => s.slug === slug);
      if (!found) {
        console.error(`Error: no shelf with slug "${slug}"`);
        process.exitCode = 1;
        return;
      }
      if (!opts.confirm) {
        console.log(`Would delete shelf ${slug} ("${found.name}") containing ${found.bookIds.length} book(s). Re-run with --confirm to delete.`);
        return;
      }
      data.shelves = data.shelves.filter((s) => s.slug !== slug);
      if (data.activeSlug === slug) data.activeSlug = null;
      writeShelves(p, data);
      console.log(`Deleted shelf ${slug}.`);
    });
}
