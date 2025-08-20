import { Client } from "@notionhq/client";
import { runtimeConfig } from "@/lib/env";

function getNotion() {
  return new Client({ auth: runtimeConfig.notion.token() });
}

export async function getPageMarkdown(pageId: string): Promise<string> {
  const blocks = await getNotion().blocks.children.list({ block_id: pageId, page_size: 100 });
  const lines: string[] = [];
  for (const block of blocks.results) {
    // very lightweight text extractor for headings/paragraphs/bulleted lists
    // we keep it simple; Notion structure may vary
    const anyBlock = block as any;
    const type = anyBlock.type as string;
    const rich = anyBlock[type]?.rich_text as Array<any> | undefined;
    const text = (rich || []).map((r) => r.plain_text).join("");
    if (!text) continue;
    if (type?.includes("heading")) lines.push(`# ${text}`);
    else if (type === "bulleted_list_item" || type === "numbered_list_item") lines.push(`- ${text}`);
    else lines.push(text);
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


