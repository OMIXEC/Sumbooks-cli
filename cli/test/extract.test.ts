import { describe, it, expect } from "vitest";
import { splitMarkdown } from "../src/extract.js";

describe("splitMarkdown", () => {
  it("splits on top-level '# ' headings, one page per heading", () => {
    const md = [
      "# Intro",
      "intro body",
      "",
      "# Chapter One",
      "chapter one body",
      "## Not a page break",
      "still chapter one",
      "# Chapter Two",
      "chapter two body",
    ].join("\n");

    const { pages, toc } = splitMarkdown(md);

    expect(pages).toHaveLength(3);
    expect(pages[0].text).toContain("# Intro");
    expect(pages[1].text).toContain("## Not a page break");
    expect(pages[1].text).toContain("still chapter one");
    expect(pages[2].text).toContain("# Chapter Two");
    expect(toc).toEqual([
      { title: "Intro", page: 1 },
      { title: "Chapter One", page: 2 },
      { title: "Chapter Two", page: 3 },
    ]);
  });

  it("treats content with no headings as a single page", () => {
    const { pages, toc } = splitMarkdown("just plain text\nno headings here");
    expect(pages).toHaveLength(1);
    expect(toc).toHaveLength(0);
  });
});
