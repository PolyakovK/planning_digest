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
    ? `Проанализируй выполненные задачи команды Revenue за неделю и создай краткое бизнес-саммари.

ЗАДАЧИ:
${taskList}

ТРЕБОВАНИЯ:
- Фокус на бизнесово важных результатах
- Максимум 3-4 ключевых пункта
- Конкретные достижения и их влияние на бизнес
- Избегай технических деталей
- Используй эмодзи для визуального разделения
- Формат: короткие пункты с результатами

Пример формата:
📊 **Аналитика:** Создана единая база контактов для улучшения лидогенерации
💼 **Финансы:** Завершена проверка NDA по 50+ клиентам, обеспечена юридическая защита
🔧 **Процессы:** Оптимизирована CRM система, улучшена работа с клиентами`

    : `Проанализируй активные задачи команды Revenue на текущую неделю и создай краткое бизнес-саммари планов.

ЗАДАЧИ:
${taskList}

ТРЕБОВАНИЯ:
- Фокус на ключевых бизнес-приоритетах недели
- Максимум 3-4 главных направления работы
- Конкретные цели и ожидаемые результаты
- Избегай технических деталей
- Используй эмодзи для визуального разделения
- Формат: короткие пункты с планами

Пример формата:
🎯 **Продажи:** Запуск тестирования с Газпромбанк Лизинг, ожидаем подписание договора
📈 **Развитие:** Подготовка новых рассылок и территориальных карт для расширения клиентской базы
💰 **Финансы:** Контроль поступлений и закрытие августовского биллинга`;

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
