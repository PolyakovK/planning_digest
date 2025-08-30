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
  
  const prompt = `Отформатируй задачу в структурированном виде согласно полям Linear.

ЗАДАЧА: ${task.title}
ОПИСАНИЕ: ${task.description || 'Нет описания'}
ПОСЛЕДНИЙ КОММЕНТАРИЙ: ${latestComment || 'Нет комментариев'}

ТРЕБОВАНИЯ:
- Сохрани структуру полей Linear
- НЕ придумывай отсутствующие поля
- Если поле пустое - оставь пустым
- Максимум 4-5 строк общего текста
- СТРОГО БЕЗ символов # или заголовков

ФОРМАТ:
**${task.title}**

Почему важно: [если есть в описании - извлеки, иначе пусто]

Описание задачи: [краткое описание или "Описание не заполнено"]

Последний комментарий: [если есть - кратко, иначе пусто]`;

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

                      const result = completion.choices[0]?.message?.content || `**${task.title}**`;
           // Убираем все символы # из ответа GPT
           return result.replace(/#/g, '').trim();
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

    const result = completion.choices[0]?.message?.content || "встреча проведена";
    // Убираем все символы # из ответа GPT
    return result.replace(/#/g, '').trim();
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
    ? `Создай краткое бизнес-саммари только из ВАЖНЫХ выполненных задач. МАКСИМУМ 5 пунктов.

ЗАДАЧИ:
${taskList}

КРИТЕРИИ ВАЖНОСТИ:
- Влияет на выручку, клиентов, продукт
- Стратегические решения и развитие
- Ключевые результаты и достижения
- Важные проблемы и их решения

ИСКЛЮЧИТЬ:
- Административные задачи (отпуска, передача дел)
- Внутренние процессы без бизнес-влияния
- Рутинные операции
- Техническая поддержка без влияния на бизнес

ФОРМАТ:
📊 **Направление:** Конкретный бизнес-результат
💼 **Направление:** Конкретный бизнес-результат
🔧 **Направление:** Конкретный бизнес-результат

ТРЕБОВАНИЯ:
- Только значимые бизнес-результаты
- Максимум 10 слов на пункт
- Конкретные достижения с цифрами

Если важных задач нет - верни: "Значимых бизнес-результатов за период не зафиксировано."`

    : `Создай краткое бизнес-саммари только из ВАЖНЫХ планов на неделю. МАКСИМУМ 5 пунктов.

ЗАДАЧИ:
${taskList}

КРИТЕРИИ ВАЖНОСТИ:
- Влияет на выручку, клиентов, продукт
- Стратегические решения и развитие
- Ключевые цели и планы
- Важные проекты и инициативы

ИСКЛЮЧИТЬ:
- Административные задачи (отпуска, передача дел)
- Внутренние процессы без бизнес-влияния
- Рутинные операции
- Техническая поддержка без влияния на бизнес

ФОРМАТ:
🎯 **Направление:** Конкретная бизнес-цель
📈 **Направление:** Конкретная бизнес-цель
💰 **Направление:** Конкретная бизнес-цель

ТРЕБОВАНИЯ:
- Только значимые бизнес-планы
- Максимум 10 слов на пункт
- Ожидаемые результаты с цифрами

Если важных задач нет - верни: "Значимых бизнес-планов на период не запланировано."`;

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

    const result = completion.choices[0]?.message?.content || "Не удалось создать саммари";
    // Убираем все символы # из ответа GPT
    return result.replace(/#/g, '').trim();
  } catch (error) {
    console.error("Error generating business summary:", error);
    return "Ошибка при создании саммари";
  }
}
