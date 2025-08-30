import { runtimeConfig } from "@/lib/env";
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: runtimeConfig.openai.apiKey(),
    });
  }
  return openaiClient;
}

export async function formatSingleTask(task: any): Promise<string> {
  const comments = task.comments?.nodes || [];
  const latestComment = comments.length > 0 ? comments[comments.length - 1].body : "";
  
  const prompt = `Отформатируй задачу в краткий структурированный вид.

ЗАДАЧА:
**${task.identifier}** - ${task.title}
Проект: ${task.project?.name || 'Без проекта'}
Исполнитель: ${task.assignee?.name || 'Не назначен'}
Описание: ${task.description || 'Нет описания'}
${latestComment ? `Последний комментарий: ${latestComment}` : ''}

       ТРЕБОВАНИЯ:
       - Максимум 2-3 строки
       - Сначала суть задачи (что делали/будут делать)
       - Потом важность или результат (если есть)
       - Конкретно и по делу
       - НЕ используй символы # в ответе

       ФОРМАТ:
       **${task.title}**
       [Краткое описание сути и результата]`;

         try {
           const completion = await getOpenAI().chat.completions.create({
             model: "gpt-4o",
             messages: [
               {
                 role: "system",
                 content: "Ты помощник, который кратко и структурированно описываешь рабочие задачи. Фокусируйся на сути и результате."
               },
               {
                 role: "user",
                 content: prompt
               }
             ],
             max_tokens: 150,
             temperature: 0.3
           });

           return completion.choices[0]?.message?.content || `**${task.title}**`;
           } catch (error) {
           console.error("Error formatting single task:", error);
           return `**${task.title}**`;
         }
}

export async function extractMeetingSummary(meetingContent: string, meetingTitle: string): Promise<string> {
  // Ищем Executive Summary в контенте
  const executiveSummaryMatch = meetingContent.match(/EXECUTIVE SUMMARY[^:]*:?\s*([^#]*?)(?=\n#|\n\n#|$)/i);
  let executiveSummary = "";
  
  if (executiveSummaryMatch) {
    executiveSummary = executiveSummaryMatch[1].trim();
  }
  
  const prompt = `Создай краткую суть встречи в одном предложении на основе данных.

ВСТРЕЧА: ${meetingTitle}

EXECUTIVE SUMMARY:
${executiveSummary || 'Не найдено'}

ПОЛНЫЙ КОНТЕНТ (если Executive Summary пустой):
${!executiveSummary ? meetingContent.slice(0, 1000) : ''}

ТРЕБОВАНИЯ:
- Одно предложение максимум 15-20 слов
- Суть: с кем встреча и главный результат/тема
- Без лишних деталей
- Деловой стиль

ФОРМАТ:
обсуждение [главной темы] с [клиентом], [ключевой результат]`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Ты помощник, который создает краткие саммари встреч для руководства. Фокусируйся на ключевых результатах и решениях."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.3
    });

    return completion.choices[0]?.message?.content || "встреча проведена";
  } catch (error) {
    console.error("Error extracting meeting summary:", error);
    return "встреча проведена";
  }
}

export async function generateBusinessSummary(
  tasks: any[],
  type: "completed" | "active"
): Promise<string> {
  const taskList = tasks.map(task => {
    const comments = task.comments?.nodes || [];
    const latestComment = comments.length > 0 ? comments[comments.length - 1].body : "";
    
    return `**${task.identifier}** - ${task.title}
Проект: ${task.project?.name || 'Без проекта'}
Исполнитель: ${task.assignee?.name || 'Не назначен'}
Описание: ${task.description || 'Нет описания'}
${latestComment ? `Последний комментарий: ${latestComment}` : ''}
---`;
  }).join('\n');

  const prompt = type === "completed" 
    ? `Создай краткое саммари выполненных задач за неделю. МАКСИМУМ 3 пункта.

ЗАДАЧИ:
${taskList}

ФОРМАТ:
📊 **Направление:** Конкретный результат
💼 **Направление:** Конкретный результат  
🔧 **Направление:** Конкретный результат

ТРЕБОВАНИЯ:
- Только факты и цифры
- Никаких общих фраз
- Максимум 10 слов на пункт
- Конкретные достижения`

    : `Создай краткое саммари планов на неделю. МАКСИМУМ 3 пункта.

ЗАДАЧИ:
${taskList}

ФОРМАТ:
🎯 **Направление:** Конкретная цель
📈 **Направление:** Конкретная цель
💰 **Направление:** Конкретная цель

ТРЕБОВАНИЯ:
- Только конкретные цели и суммы
- Никаких общих фраз  
- Максимум 10 слов на пункт
- Ожидаемые результаты с цифрами`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o", // GPT-5 пока недоступен, используем лучшую доступную модель
      messages: [
        {
          role: "system",
          content: "Ты бизнес-аналитик, который создает краткие и понятные саммари для руководства компании. Фокусируйся на бизнес-ценности и результатах."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    return completion.choices[0]?.message?.content || "Не удалось создать саммари";
  } catch (error) {
    console.error("Error generating business summary:", error);
    return "Ошибка при создании саммари";
  }
}
