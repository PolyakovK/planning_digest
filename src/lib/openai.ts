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
