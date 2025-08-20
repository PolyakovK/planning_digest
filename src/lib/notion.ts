import { Client } from "@notionhq/client";
import { runtimeConfig } from "@/lib/env";

function getNotion() {
  return new Client({ auth: runtimeConfig.notion.token() });
}

async function listAllBlocks(blockId: string) {
  const notion = getNotion();
  const results: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const resp = await notion.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor });
    results.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor ?? undefined : undefined;
  } while (cursor);
  return results;
}

function extractTextFromRich(rich?: Array<any>): string {
  return (rich || []).map((r) => r.plain_text).join("");
}

export async function getPageMarkdown(pageId: string, depth: number = 1): Promise<string> {
  const blocks = await listAllBlocks(pageId);
  const lines: string[] = [];
  for (const block of blocks) {
    const anyBlock = block as any;
    const type = anyBlock.type as string;
    if (!type) continue;
    if (type.includes("heading")) {
      const text = extractTextFromRich(anyBlock[type]?.rich_text);
      if (text) lines.push(`# ${text}`);
      continue;
    }
    if (type === "paragraph") {
      const text = extractTextFromRich(anyBlock.paragraph?.rich_text);
      if (text) lines.push(text);
      continue;
    }
    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      const text = extractTextFromRich(anyBlock[type]?.rich_text);
      if (text) lines.push(`- ${text}`);
      continue;
    }
    if (type === "child_page" && depth > 0) {
      const childTitle: string = anyBlock.child_page?.title ?? "";
      lines.push(`\n## ${childTitle}`);
      const childId: string = anyBlock.id;
      const childText = await getPageMarkdown(childId, depth - 1);
      if (childText) lines.push(childText);
      continue;
    }
    if (type === "link_to_page" && depth > 0) {
      const linkPageId: string | undefined = anyBlock.link_to_page?.page_id;
      if (linkPageId) {
        const childText = await getPageMarkdown(linkPageId, depth - 1);
        if (childText) lines.push(childText);
      }
      continue;
    }
  }
  return lines.join("\n");
}

export async function appendMarkdownToPage(pageId: string, markdown: string) {
  const blocks = markdown_to_notion_blocks(markdown);
  // Notion API allows up to 100 children per append
  for (let i = 0; i < blocks.length; i += 50) {
    await getNotion().blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + 50) as any
    });
  }
}

export async function createChildPage(parentPageId: string, title: string): Promise<string> {
  const page = await getNotion().pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: [
          {
            type: "text",
            text: { content: title }
          }
        ]
      }
    }
  } as any);
  return (page as any).id as string;
}

export async function listChildPages(parentPageId: string): Promise<Array<{ id: string; title: string }>> {
  const blocks = await listAllBlocks(parentPageId);
  const pages: Array<{ id: string; title: string }> = [];
  for (const block of blocks) {
    const anyBlock = block as any;
    if (anyBlock.type === "child_page") {
      pages.push({ id: anyBlock.id, title: anyBlock.child_page?.title ?? "" });
    }
  }
  return pages;
}

export function parseDateFromTitle(title: string): Date | null {
  // match dd.mm.yyyy or dd.mm.yy
  const m = title.match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const year = yyyy.length === 2 ? Number(`20${yyyy}`) : Number(yyyy);
  const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
  return isNaN(date.getTime()) ? null : date;
}

export function isWithinDays(date: Date, days: number, now: Date = new Date()): boolean {
  const ms = days * 24 * 60 * 60 * 1000;
  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff <= ms;
}

export async function getLatestChildPageMarkdownByDate(rootPageId: string): Promise<{ title: string; markdown: string } | null> {
  const pages = await listChildPages(rootPageId);
  let best: { id: string; title: string; date: Date } | null = null;
  for (const p of pages) {
    const d = parseDateFromTitle(p.title);
    if (!d) continue;
    if (!best || d.getTime() > best.date.getTime()) {
      best = { id: p.id, title: p.title, date: d };
    }
  }
  if (!best) return null;
  const markdown = await getPageMarkdown(best.id, 2);
  return { title: best.title, markdown };
}

// Convert simple Markdown to Notion blocks
export function markdown_to_notion_blocks(markdown: string): Array<any> {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");

  function toRich(text: string) {
    if (!text) return [] as any[];
    const parts = text.split(/\*\*/);
    const rich: any[] = [];
    for (let i = 0; i < parts.length; i++) {
      const content = parts[i];
      if (!content) continue;
      rich.push({
        type: "text",
        text: { content },
        annotations: { bold: i % 2 === 1 }
      });
    }
    return rich.length ? rich : [{ type: "text", text: { content: text } }];
  }

  const blocks: any[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // пустые строки — пропускаем
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const key = (level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3") as
        | "heading_1"
        | "heading_2"
        | "heading_3";
      blocks.push({
        object: "block",
        type: key,
        [key]: { rich_text: toRich(text) }
      });
      continue;
    }

    const li = line.match(/^[-•]\s+(.*)$/);
    if (li) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: toRich(li[1]) }
      });
      continue;
    }

    // paragraph fallback
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: toRich(line) }
    });
  }

  return blocks;
}

export async function getMeetingsRawForLastDays(meetingsRootId: string, days: number): Promise<string> {
  const ownerSections = await listChildPages(meetingsRootId);
  const chunks: string[] = [];
  for (const owner of ownerSections) {
    const meetings = await listChildPages(owner.id);
    const recent = meetings
      .map((m) => ({ ...m, date: parseDateFromTitle(m.title) }))
      .filter((m) => m.date && isWithinDays(m.date as Date, days)) as Array<{ id: string; title: string; date: Date }>;
    if (recent.length === 0) continue;
    chunks.push(`\n[OWNER] ${owner.title}`);
    for (const meet of recent) {
      const text = await getPageMarkdown(meet.id, 1);
      chunks.push(`- ${meet.title}\n${text}`);
    }
  }
  return chunks.join("\n");
}

export async function getForecastsRawAggregate(
  forecastsRootId: string,
  days: number = 7,
  limit: number = 10
): Promise<string> {
  const items = await listChildPages(forecastsRootId);
  const dated = items
    .map((p) => ({ ...p, date: parseDateFromTitle(p.title) }))
    .filter((p) => !!p.date && isWithinDays(p.date as Date, days))
    .sort((a, b) => (b.date!.getTime() - a.date!.getTime()));
  const top = dated.slice(0, limit);
  const parts: string[] = [];
  for (const it of top) {
    const md = await getPageMarkdown(it.id, 1);
    parts.push(`[FORECAST] ${it.title}\n${md}`);
  }
  return parts.join("\n\n");
}

export async function getForecastsListForLastDays(
  forecastsRootId: string,
  days: number = 7
): Promise<Array<{ title: string; url?: string; date?: Date }>> {
  const notion = getNotion();
  const items = await listChildPages(forecastsRootId);
  const dated = items
    .map((p) => ({ ...p, date: parseDateFromTitle(p.title) }))
    .filter((p) => !!p.date && isWithinDays(p.date as Date, days))
    .sort((a, b) => (b.date!.getTime() - a.date!.getTime()));
  const result: Array<{ title: string; url?: string; date?: Date }> = [];
  for (const it of dated) {
    try {
      const page = (await notion.pages.retrieve({ page_id: it.id as string })) as any;
      result.push({ title: it.title, url: page?.url, date: it.date as Date });
    } catch {
      result.push({ title: it.title, date: it.date as Date });
    }
  }
  return result;
}


