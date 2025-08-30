import { appendMarkdownToPage, createChildPage } from "@/lib/notion";
import { 
  fetchSignedDocumentsFromLinear, 
  fetchReceivedPaymentsFromLinear,
  fetchDoneTasksFromLinear,
  fetchActiveTasksFromLinear,
  fetchAllRevenueProjects,
  groupTasksByProject
} from "@/lib/linear";
import { generateBusinessSummary, formatSingleTask } from "@/lib/openai";
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

async function buildDepartmentBreakdownMarkdown(): Promise<string> {
  const [doneTasks, activeTasks, allProjects] = await Promise.all([
    fetchDoneTasksFromLinear(),
    fetchActiveTasksFromLinear(),
    fetchAllRevenueProjects()
  ]);
  
  const doneByProject = groupTasksByProject(doneTasks);
  const activeByProject = groupTasksByProject(activeTasks);
  
  let markdown = "## 📋 Итоги и планы по отделам\n\n";
  
  // Проходим по всем проектам команды Revenue
  for (const projectName of allProjects) {
    const projectDoneTasks = doneByProject[projectName] || [];
    const projectActiveTasks = activeByProject[projectName] || [];
    
    // Показываем все проекты, даже пустые
    
    markdown += `### ${getProjectEmoji(projectName)} ${projectName}\n\n`;
    markdown += "<columns>\n\n";
    
    // Левая колонка - Итоги
    markdown += "#### 📊 Итоги недели\n\n";
    if (projectDoneTasks.length === 0) {
      markdown += "Выполненных задач пока нет.\n\n";
    } else {
      // Форматируем каждую задачу через GPT
      const formattedDoneTasks = await Promise.all(
        projectDoneTasks.map(task => formatSingleTask(task))
      );
      
      for (const formattedTask of formattedDoneTasks) {
        markdown += `${formattedTask}\n\n`;
      }
    }
    
    markdown += "<split/>\n\n";
    
    // Правая колонка - Планы
    markdown += "#### 🎯 Планы недели\n\n";
    if (projectActiveTasks.length === 0) {
      markdown += "Активных задач пока нет.\n\n";
    } else {
      // Форматируем каждую задачу через GPT
      const formattedActiveTasks = await Promise.all(
        projectActiveTasks.map(task => formatSingleTask(task))
      );
      
      for (const formattedTask of formattedActiveTasks) {
        markdown += `${formattedTask}\n\n`;
      }
    }
    
    markdown += "</columns>\n\n";
  }
  
  return markdown;
}

function getProjectEmoji(projectName: string): string {
  const emojiMap: Record<string, string> = {
    'Sales': '💼',
    'Digital Sales': '📱',
    'Business Development': '📈',
    'Project': '🔧',
    'Partner': '🤝',
    'Finance': '💰',
    'Documents': '📄',
    'CSM': '👥',
    'Analytics': '📊'
  };
  
  return emojiMap[projectName] || '📋';
}

export async function POST() {
  try {
    const parentId = runtimeConfig.digest.targetPageId();
    const title = `Weekly Digest ${new Date().toISOString().slice(0, 10)}`;
    const pageId = await createChildPage(parentId, title);
    
    // Build digest content
    const [financialSection, weeklyFocusSection, departmentSection] = await Promise.all([
      buildFinancialResultsMarkdown(),
      buildWeeklyFocusMarkdown(),
      buildDepartmentBreakdownMarkdown()
    ]);
    
    const fullDigest = financialSection + weeklyFocusSection + departmentSection;
    
    await appendMarkdownToPage(pageId, fullDigest);
    return new Response(JSON.stringify({ ok: true, pageId, title }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


