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
  // naive append as paragraph blocks chunked by 1800 chars
  const chunks: string[] = [];
  for (let i = 0; i < markdown.length; i += 1800) chunks.push(markdown.slice(i, i + 1800));
  for (const chunk of chunks) {
    await getNotion().blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: chunk } }]
          }
        }
      ]
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


