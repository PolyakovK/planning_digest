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

КРИТИЧЕСКИ ВАЖНО: НЕ ПРИДУМЫВАЙ ДАННЫЕ. Используй только информацию из источников.

Формулируй задачи полными предложениями с контекстом:
- ❌ "Продлить токен" → ✅ "Продлить токен для Kucher для запуска интеграции"
- ❌ "Выслать документацию" → ✅ "Выслать API-документацию YoFin для старта пилота"
- ❌ "Передать ТЗ в разработку" → ✅ "Передать ТЗ по FinBridge в разработку"
- ❌ "Настроить Linear" → ✅ "Настроить Linear для автоматизации задач команды"

## Маппинг сотрудников по отделам:
- CRO: Егор Москвие [стратегические инициативы, общее руководство]
- Sales: Константин Поляков
- BizDev (Nevel): Есения 
- Digital Sales: Кира Стасюкевич
- Finance: Екатерина Богданова
- Project Manager: Евгения Попова [запуск проектов, тесты]
- CSM: Василий Комлев
- Partner: Мария Парашенко [работа с партнерами]
- Rev Operations: Виолетта [задачи по автоматизации процессов]
- Marketing: Виолетта [SEO, сайт, мероприятия]

## Требования к содержанию: 
Четкая иерархия, бизнес-фокус, приоритизация, краткость, понятные всем термины. Извлекай ключевые бизнес-результаты, группируй по важности, переводя технические детали в бизнес-язык.

Верни строго JSON следующего формата (и только JSON, без комментариев):
{
  "tldr": ["2-3 главных момента недели кратко"],
  "highlights": ["3-5 главных достижения/решений недели из ВСЕХ источников, по 1 короткой фразе"],
  "departments": [
    {
      "name": "CRO",
      "people": [
        {
          "name": "Имя Фамилия", 
          "focus": ["бизнес-направления на неделю (1-3)"],
          "tasks": ["ключевые бизнес-задачи коротко, без технических деталей (1-3)"]
        }
      ]
    },
    { "name": "Sales", "people": [] },
    { "name": "BizDev", "people": [] },
    { "name": "Digital Sales", "people": [] },
    { "name": "Finance", "people": [] },
    { "name": "Project Manager", "people": [] },
    { "name": "CSM", "people": [] },
    { "name": "Partner", "people": [] },
    { "name": "Rev Operations", "people": [] },
    { "name": "Marketing", "people": [] }
  ],
  "clientActivity": [
    {
      "employee": "Имя Фамилия",
      "clients": [
        { "name": "Клиент", "status": "краткий статус в 5-7 слов" }
      ]
    }
  ],
  "forecasts": {
    "numbers": ["метрики/сделки"],
    "launches": ["новые проекты/интеграции"],
    "risks": ["риски из форкастов"]
  },
  "attention": {
    "critical": ["критично, решить до пятницы"],
    "important": ["важно, решить на следующей неделе"]
  }
}
## Правила заполнения:
- "highlights" и "attention" — анализируй ВСЕ источники: Weekly, Meetings_7D и Forecasts_7D
- "departments" — заполняй ТОЛЬКО по weeklyLatestText, распределяя людей строго по указанному маппингу
  - focus: бизнес-направления/клиенты, без технических терминов
  - tasks: короткие бизнес-задачи понятные CEO (не "продлить токен", а "запустить интеграцию")
  - Убирай технические детали: API, токены, документацию → заменяй на бизнес-смысл
- "clientActivity" — формируй ТОЛЬКО по Meetings_7D, точно копируя названия и даты
- "clientActivity.clients[].status" — формируй ТОЛЬКО по Meetings_7D как краткий статус (5-7 слов)
- "forecasts" — формируй ТОЛЬКО по Forecasts_7D и разнеси по категориям numbers/launches/risks
- Если информации по отделу нет в источниках — не включай этот отдел в результат
- Если человек не упомянут в источниках — не включай его
- Если один человек работает в двух отделах (например, Виолетта) — включай в оба с соответствующими задачами

Источник данных:
[WEEKLY_ALL]\n${weeklyAllText}\n\n[WEEKLY_LATEST] \n${weeklyLatestText}\n\n[MEETINGS_7D]\n${allMeetingsText}\n\n[FORECASTS_7D]\n${forecastsText}`;
}


