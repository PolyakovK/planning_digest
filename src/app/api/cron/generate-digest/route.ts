import { appendMarkdownToPage, createChildPage } from "@/lib/notion";
import { buildDigestMarkdown } from "@/lib/summary";
import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  try {
    const markdown = await buildDigestMarkdown();
    const parentId = runtimeConfig.digest.targetPageId();
    const title = `Weekly Digest ${new Date().toISOString().slice(0, 10)}`;
    const pageId = await createChildPage(parentId, title);
    await appendMarkdownToPage(pageId, markdown);
    return new Response(JSON.stringify({ ok: true, pageId, title }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


