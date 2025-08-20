import OpenAI from "openai";
import { runtimeConfig } from "@/lib/env";

function getOpenAI() {
  return new OpenAI({ apiKey: runtimeConfig.openai.apiKey() });
}
const MODEL = runtimeConfig.openai.model();

export async function generateText(input: string): Promise<string> {
  if (MODEL !== "gpt-5-mini") {
    // enforce required model choice
    throw new Error("OPENAI_MODEL must be 'gpt-5-mini'");
  }
  const res = await getOpenAI().responses.create({ model: MODEL, input });
  return res.output_text as string;
}

export function buildWeeklyDigestPrompt(opts: {
  weeklyPlanningText: string;
  allMeetingsText: string;
  forecastsText: string;
}): string {
  const { weeklyPlanningText, allMeetingsText, forecastsText } = opts;
  return `Ты — ассистент-компактного менеджерского дайджеста. На входе «сырой» экспорт из Notion (возможны заголовки, маркеры, повторяющиеся блоки). Не требуй доп. ввода.

1) Сформируй блок "Планирование ревенью команды". По каждому сотруднику:
- Фокусные клиенты на неделю (списком)
- Прочие приоритеты/автоматизация (1-3 пункта)
Пиши кратко, без воды.

2) Итоги по прошедшим встречам (7 дней):
Для каждого сотрудника, сгруппируй встречи, укажи 1-2 главных вопроса и краткий результат.

3) Форкасты: краткое саммари ключевых обсуждений, проблем и задач.

Формат вывода: Markdown, только три блока с подзаголовками.

[WEEKLY PLANNING RAW]\n${weeklyPlanningText}\n\n[MEETINGS RAW]\n${allMeetingsText}\n\n[FORECASTS RAW]\n${forecastsText}`;
}

export function buildWeeklyTasksExtractionPrompt(weeklyPlanningText: string): string {
  return `Извлеки задачи для создания issues в Linear из Weekly Planning. Верни строго JSON:
{
  "employees": [
    {
      "name": "Имя Фамилия",
      "tasks": [
        { "title": "краткий заголовок", "description": "описание/контекст" }
      ]
    }
  ]
}
Если нет задач у сотрудника — не включай его. Текст источника ниже:\n\n${weeklyPlanningText}`;
}


