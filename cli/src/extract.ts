import fs from "node:fs";

export interface TocEntry {
  title: string;
  page: number;
}

export interface ExtractedPage {
  text: string;
}

export interface ExtractedDoc {
  pages: ExtractedPage[];
  toc: TocEntry[];
}

/**
 * Split markdown on top-level `# ` headings. Each heading starts a new page.
 * Content before the first `# ` heading (if any) becomes page 1 with no heading.
 */
export function splitMarkdown(text: string): ExtractedDoc {
  const lines = text.split(/\r?\n/);
  const pages: string[] = [];
  const toc: TocEntry[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      pages.push(current.join("\n").trim());
    }
  };

  for (const line of lines) {
    if (/^# (.+)/.test(line)) {
      flush();
      current = [line];
      toc.push({ title: line.replace(/^# /, "").trim(), page: pages.length + 1 });
    } else {
      current.push(line);
    }
  }
  flush();

  if (pages.length === 0) {
    // No headings at all: whole file is page 1.
    pages.push(text.trim());
  }

  return { pages: pages.map((p) => ({ text: p })), toc };
}

export async function extractPdf(filePath: string): Promise<ExtractedDoc> {
  // pdf-parse ships no ESM types; default import works under esModuleInterop.
  const pdfParse = (await import("pdf-parse")).default as (buf: Buffer) => Promise<{
    text: string;
    numpages: number;
  }>;
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  // pdf-parse joins pages with form-feed (\f) characters.
  const rawPages = data.text.split("\f");
  let pages = rawPages.map((t) => t.trim());
  if (pages.length < data.numpages) {
    while (pages.length < data.numpages) pages.push("");
  }
  if (pages.length === 0) pages = [""];
  const toc: TocEntry[] = [];
  return { pages: pages.map((t) => ({ text: t })), toc };
}

export async function extractFile(filePath: string): Promise<ExtractedDoc> {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return extractPdf(filePath);
  }
  const text = fs.readFileSync(filePath, "utf8");
  return splitMarkdown(text);
}
