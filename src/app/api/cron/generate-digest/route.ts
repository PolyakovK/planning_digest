import { appendMarkdownToPage, createChildPage, getMeetingsForLastDays } from "@/lib/notion";
import { 
  fetchSignedDocumentsFromLinear, 
  fetchReceivedPaymentsFromLinear,
  fetchDoneTasksFromLinear,
  fetchActiveTasksFromLinear,
  fetchAllRevenueProjects,
  groupTasksByProject
} from "@/lib/linear";
import { generateBusinessSummary, formatSingleTask, extractMeetingSummary } from "@/lib/openai";
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
  
  // Найти задачу REV-101 для добавления её последнего комментария в итоги Sales
  const rev101Task = activeTasks.find(task => task.identifier === 'REV-101');
  let rev101LastComment = '';
  let rev101Description = '';
  
  console.log('DEBUG REV-101: найдена задача?', !!rev101Task);
  console.log('DEBUG REV-101: количество комментариев:', rev101Task?.comments?.nodes?.length || 0);
  
  if (rev101Task) {
    // Получить описание задачи для планов
    rev101Description = rev101Task.description || '';
    
    // Получить самый последний комментарий (без ограничения по дате)
    if (rev101Task.comments?.nodes?.length > 0) {
      const lastComment = rev101Task.comments.nodes[rev101Task.comments.nodes.length - 1];
      rev101LastComment = lastComment.body || '';
      console.log('DEBUG REV-101: последний комментарий:', rev101LastComment ? 'есть' : 'пустой');
    }
  }
  
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
    markdown += "**📊 Итоги недели**\n\n";
    
    // Для проекта Sales добавляем последний комментарий REV-101
    if (projectName === 'Sales') {
      markdown += "**🎯 Фокусные клиенты (итоги прошлой недели):**\n\n";
      if (rev101LastComment && rev101LastComment.trim()) {
        markdown += rev101LastComment + "\n\n";
      } else {
        markdown += "Комментарии за неделю отсутствуют.\n\n";
      }
    }
    
    if (projectDoneTasks.length === 0) {
      markdown += "Выполненных задач пока нет.\n\n";
    } else {
      // Обрабатываем задачи с особой логикой для REV-101
      const formattedDoneTasks = await Promise.all(
        projectDoneTasks.map(async (task) => {
          if (task.identifier === 'REV-101') {
            // Специальная логика для REV-101 - показываем полное описание без LLM
            const title = task.title || 'Без названия';
            const description = task.description || 'Нет описания';
            return `**${title}**\n\n${description}`;
          } else {
            // Обычная логика через LLM для всех остальных задач
            return await formatSingleTask(task);
          }
        })
      );
      
      for (const formattedTask of formattedDoneTasks) {
        markdown += `🔸 ${formattedTask}\n\n`;
      }
    }
    
    markdown += "<split/>\n\n";
    
    // Правая колонка - Планы
    markdown += "**🎯 Планы недели**\n\n";
    
    // Для проекта Sales добавляем описание REV-101 
    if (projectName === 'Sales' && rev101Description) {
      markdown += "**🔹 Фокусные клиенты**\n\n";
      markdown += rev101Description + "\n\n";
    }
    
    if (projectActiveTasks.length === 0) {
      markdown += "Других активных задач пока нет.\n\n";
    } else {
      // Обрабатываем задачи, исключая REV-101 для Sales (она уже обработана выше)
      const tasksToProcess = projectName === 'Sales' 
        ? projectActiveTasks.filter(task => task.identifier !== 'REV-101')
        : projectActiveTasks;
        
      const formattedActiveTasks = await Promise.all(
        tasksToProcess.map(async (task) => {
          if (task.identifier === 'REV-101') {
            // Специальная логика для REV-101 - показываем полное описание без LLM
            const title = task.title || 'Без названия';
            const description = task.description || 'Нет описания';
            return `**${title}**\n\n${description}`;
          } else {
            // Обычная логика через LLM для всех остальных задач
            return await formatSingleTask(task);
          }
        })
      );
      
      for (const formattedTask of formattedActiveTasks) {
        markdown += `🔹 ${formattedTask}\n\n`;
      }
    }
    
    markdown += "</columns>\n\n";
  }
  
  return markdown;
}

async function buildMeetingsMarkdown(): Promise<string> {
  const meetingsRootId = runtimeConfig.meetings.rootPageId();
  const meetingsData = await getMeetingsForLastDays(meetingsRootId, 7);
  
  let markdown = "## 📅 Встречи\n\n";
  
  if (meetingsData.length === 0) {
    markdown += "За последние 7 дней встреч не проводилось.\n\n";
    return markdown;
  }
  
  // Подсчитываем общее количество встреч
  const totalMeetings = meetingsData.reduce((sum, dept) => sum + dept.meetings.length, 0);
  markdown += `За последние 7 дней проведено **${totalMeetings} встреч** по отделам:\n\n`;
  
  for (const department of meetingsData) {
    const deptEmoji = getDepartmentEmoji(department.department);
    markdown += `### ${deptEmoji} ${department.department} - ${department.meetings.length} встреч\n\n`;
    
    // Обрабатываем встречи через GPT для получения кратких саммари
    const meetingSummaries = await Promise.all(
      department.meetings.map(async (meeting) => {
        const summary = await extractMeetingSummary(meeting.content, meeting.title);
        return { title: meeting.title, summary };
      })
    );
    
    for (const meeting of meetingSummaries) {
      // Извлекаем название клиента из заголовка встречи (до первого ":")
      const clientName = meeting.title.split(':')[0].trim();
      markdown += `- **${clientName}** - ${meeting.summary}\n`;
    }
    
    markdown += "\n";
  }
  
  return markdown;
}

function getDepartmentEmoji(departmentName: string): string {
  const emojiMap: Record<string, string> = {
    'Sales (Костя)': '💼',
    'Digital Sales (Кира)': '📱',
    'Digital Sales (Кирилл)': '📱',
    'Bizdev (Есения / Костя)': '📈',
    'Business Development': '📈',
    'Project (Женя)': '🔧',
    'Partner (Маша)': '🤝',
    'Finance (Катя)': '💰',
    'CSM (Вася)': '👥'
  };
  
  return emojiMap[departmentName] || '📋';
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
    const [financialSection, weeklyFocusSection, departmentSection, meetingsSection] = await Promise.all([
      buildFinancialResultsMarkdown(),
      buildWeeklyFocusMarkdown(),
      buildDepartmentBreakdownMarkdown(),
      buildMeetingsMarkdown()
    ]);
    
    const fullDigest = financialSection + weeklyFocusSection + departmentSection + meetingsSection;
    
    await appendMarkdownToPage(pageId, fullDigest);
    return new Response(JSON.stringify({ ok: true, pageId, title }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


