import { appendMarkdownToPage, createChildPage } from "@/lib/notion";
import { fetchSignedDocumentsFromLinear } from "@/lib/linear";
import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

async function buildFinancialResultsMarkdown(): Promise<string> {
  const signedDocs = await fetchSignedDocumentsFromLinear(7);
  
  let markdown = "## 💰 Финансовые результаты\n\n";
  markdown += "### 📋 Подписанные документы за последние 7 дней\n\n";
  
  if (signedDocs.length === 0) {
    markdown += "Подписанных документов за последние 7 дней не найдено.\n\n";
  } else {
    for (const doc of signedDocs) {
      markdown += `- ${doc}\n`;
    }
    markdown += "\n";
  }
  
  return markdown;
}

export async function POST() {
  try {
    const parentId = runtimeConfig.digest.targetPageId();
    const title = `Weekly Digest ${new Date().toISOString().slice(0, 10)}`;
    const pageId = await createChildPage(parentId, title);
    
    // Build digest content
    const financialSection = await buildFinancialResultsMarkdown();
    
    await appendMarkdownToPage(pageId, financialSection);
    return new Response(JSON.stringify({ ok: true, pageId, title }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


