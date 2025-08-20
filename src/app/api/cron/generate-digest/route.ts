import { appendMarkdownToPage } from "@/lib/notion";
import { buildDigestMarkdown } from "@/lib/summary";
import { runtimeConfig } from "@/lib/env";

export const runtime = "edge";

export async function POST() {
  try {
    const markdown = await buildDigestMarkdown();
    const pageId = runtimeConfig.digest.targetPageId();
    await appendMarkdownToPage(pageId, `\n\n## Weekly Digest\n${markdown}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


