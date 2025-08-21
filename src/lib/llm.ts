import OpenAI from "openai";
import { runtimeConfig } from "@/lib/env";

function getOpenAI() {
  return new OpenAI({ apiKey: runtimeConfig.openai.apiKey() });
}
const MODEL = runtimeConfig.openai.model();

export async function generateText(input: string, modelOverride?: string): Promise<string> {
  const res = await getOpenAI().responses.create({ model: modelOverride || MODEL, input });
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

export function buildStructuredDigestJsonPrompt(opts: {
  weeklyAllText: string; // все weekly-страницы
  weeklyLatestText: string; // последняя страница weekly
  allMeetingsText: string;
  forecastsText: string;
}): string {
  const { weeklyAllText, weeklyLatestText, allMeetingsText, forecastsText } = opts;
  return `Ты — аналитик, готовящий компактный еженедельный дайджест для руководства. На входе разрозненный текст из Notion.

Требования к содержанию: четкая иерархия, бизнес-фокус, приоритизация, краткость, понятные всем термины. Извлекай ключевые бизнес-результаты, группируй по важности, переводя технические детали в бизнес-язык. Не придумывай данные.

Верни строго JSON следующего формата (и только JSON, без комментариев). 
- "highlights" и "attention" формируй, анализируя ВСЕ источники: все Weekly, Meetings_7D и Forecasts_7D.
- "departments" заполняй ТОЛЬКО по последнему Weekly (weeklyLatestText).
- "clientActivity" формируй ТОЛЬКО по Meetings_7D.
- "forecastsSummary" формируй ТОЛЬКО по Forecasts_7D.
{
  "highlights": ["3-5 главных достижения/решения недели, по 1 короткой фразе"],
  "departments": [
    {
      "name": "Sales | BizDev | Project | Partner | CSM | Digital Sales | Finance",
      "people": [
        {
          "name": "Имя Фамилия",
          "focus": ["клиенты/направления на неделю (1-4)"],
          "tasks": ["ключевые задачи (1-3)"]
        }
      ]
    }
  ],
  "clientActivity": [
    {
      "employee": "Имя Фамилия",
      "meetings": [
        { "title": "Клиент или тема (дата)", "question": "главный вопрос", "result": "результат/след. шаг" }
      ]
    }
  ],
  "forecastsSummary": ["краткие выводы из форкастов (3-6 пунктов)"],
  "attention": ["риски/блокеры — коротко"]
}

Источник данных:
[WEEKLY_ALL]\n${weeklyAllText}\n\n[WEEKLY_LATEST]\n${weeklyLatestText}\n\n[MEETINGS_7D]\n${allMeetingsText}\n\n[FORECASTS_7D]\n${forecastsText}`;
}


