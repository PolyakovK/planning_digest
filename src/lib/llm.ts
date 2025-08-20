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
  return `Ты — ассистент-компактного менеджерского дайджеста. На входе «сырой» экспорт из Notion (возможны заголовки, маркеры, повторения). Не требуй доп. ввода.

1) Сформируй блок "Планирование ревенью команды" (очень кратко, 1–2 строки на человека). Для каждого сотрудника используй формат:
- ИМЯ (жирно на отдельной строке)
  Фокус: ...
  Прочие: ...

2) Итоги по прошедшим встречам (7 дней, БРАТЬ ТОЛЬКО ИЗ MEETINGS RAW):
- для каждого сотрудника перечисли только реально прошедшие встречи за 7 дней,
- по каждой встрече: один главный вопрос и один результат/след. шаг,
- если встреч у сотрудника нет — этого сотрудника не выводи.

3) Форкасты: выведи 3–6 коротких маркеров, сгруппировав на «обсуждения», «проблемы/риски», «задачи/сроки». Избегай длинных абзацев.

Формат вывода:
- не используй символы #; заголовки дай как обычные строки В ВЕРХНЕМ РЕГИСТРЕ,
- списки начинай с "- ",
- общий объём — компактный.

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


