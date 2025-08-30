import { appendMarkdownToPage, createChildPage } from "@/lib/notion";
import { 
  fetchSignedDocumentsFromLinear, 
  fetchReceivedPaymentsFromLinear,
  fetchDoneTasksFromLinear,
  fetchActiveTasksFromLinear 
} from "@/lib/linear";
import { generateBusinessSummary } from "@/lib/openai";
import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

async function buildFinancialResultsMarkdown(): Promise<string> {
  const [signedDocs, receivedPayments] = await Promise.all([
    fetchSignedDocumentsFromLinear(7),
    fetchReceivedPaymentsFromLinear(7)
  ]);
  
  let markdown = "## 💰 Финансовые результаты\n\n";
  
  // Подписанные документы
  markdown += "### 📋 Подписанные документы за последние 7 дней\n\n";
  if (signedDocs.length === 0) {
    markdown += "Подписанных документов за последние 7 дней не найдено.\n\n";
  } else {
    for (const doc of signedDocs) {
      markdown += `- ${doc}\n`;
    }
    markdown += "\n";
  }
  
  // Полученные деньги
  markdown += "### 💵 Полученные деньги за последние 7 дней\n\n";
  if (receivedPayments.length === 0) {
    markdown += "Не было поступлений.\n\n";
  } else {
    for (const payment of receivedPayments) {
      markdown += `- ${payment}\n`;
    }
    markdown += "\n";
  }
  
  return markdown;
}

async function buildWeeklyFocusMarkdown(): Promise<string> {
  const [doneTasks, activeTasks] = await Promise.all([
    fetchDoneTasksFromLinear(),
    fetchActiveTasksFromLinear()
  ]);
  
  const [completedSummary, activeSummary] = await Promise.all([
    generateBusinessSummary(doneTasks, "completed"),
    generateBusinessSummary(activeTasks, "active")
  ]);
  
  let markdown = "## 🎯 Итоги и Фокус недели\n\n";
  
  // Двухколоночная структура
  markdown += "<columns>\n\n";
  
  // Левая колонка - Итоги
  markdown += "### 📊 Итоги недели\n\n";
  markdown += completedSummary + "\n\n";
  
  markdown += "<split/>\n\n";
  
  // Правая колонка - Фокус
  markdown += "### 🎯 Фокус недели\n\n";
  markdown += activeSummary + "\n\n";
  
  markdown += "</columns>\n\n";
  
  return markdown;
}

export async function POST() {
  try {
    const parentId = runtimeConfig.digest.targetPageId();
    const title = `Weekly Digest ${new Date().toISOString().slice(0, 10)}`;
    const pageId = await createChildPage(parentId, title);
    
    // Build digest content
    const [financialSection, weeklyFocusSection] = await Promise.all([
      buildFinancialResultsMarkdown(),
      buildWeeklyFocusMarkdown()
    ]);
    
    const fullDigest = financialSection + weeklyFocusSection;
    
    await appendMarkdownToPage(pageId, fullDigest);
    return new Response(JSON.stringify({ ok: true, pageId, title }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


