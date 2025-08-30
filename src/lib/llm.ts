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
export function buildLinearMeetingsPrompt(opts: { linear: string; meetings: string }): string {
  return `Проанализируй данные и создай структурированный дайджест.

ДАННЫЕ ИЗ LINEAR:
${opts.linear}

ДАННЫЕ ИЗ ВСТРЕЧ:
${opts.meetings}

Создай JSON в формате:
{
  "departments": {
    "Sales": { "completed": ["задача: результат"], "planned": ["задача: план"] },
    "Digital Sales": { "completed": [], "planned": [] }
  },
  "meetings": {
    "Sales (Костя)": { "total_meetings": 0, "key_clients": [""], "main_goals": "", "results": "" }
  }
}

Правила:
1) Используй только предоставленные данные.
2) Группируй задачи по отделам из Linear.
3) Для встреч извлекай информацию из саммари.
4) Будь краток и конкретен.`;
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
  "weekStatus": ["5-10 пунктов, смешанные позитив/риски, по важности"],
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
  "keyMeetings": [
    {
      "employee": "Имя Фамилия",
      "clients": [ { "name": "Клиент", "status": "результат 3-5 слов" } ]
    }
  ],
  "_meta": { "order": ["CRO","Sales","BizDev","Digital Sales","Finance","Project Manager","CSM","Partner","Rev Operations","Marketing"] }
}
## Правила заполнения:
- "highlights" и "attention" — анализируй ВСЕ источники: Weekly, Meetings_7D и Forecasts_7D
- "departments" — заполняй ТОЛЬКО по weeklyLatestText, распределяя людей строго по указанному маппингу
  - focus: бизнес-направления/клиенты, без технических терминов
  - tasks: короткие бизнес-задачи понятные CEO (не "продлить токен", а "запустить интеграцию")
  - Убирай технические детали: API, токены, документацию → заменяй на бизнес-смысл
- "clientActivity" — формируй ТОЛЬКО по Meetings_7D, точно копируя названия и даты
- "weekStatus" — формируй из ВСЕХ источников (Weekly_ALL + Meetings_7D + Forecasts_7D)
- "keyMeetings[].clients[].status" — формируй ТОЛЬКО по Meetings_7D, 3–5 слов
- Если информации по отделу нет в источниках — не включай этот отдел в результат
- Если человек не упомянут в источниках — не включай его
- Если один человек работает в двух отделах (например, Виолетта) — включай в оба с соответствующими задачами

Источник данных:
[WEEKLY_ALL]\n${weeklyAllText}\n\n[WEEKLY_LATEST] \n${weeklyLatestText}\n\n[MEETINGS_7D]\n${allMeetingsText}\n\n[FORECASTS_7D]\n${forecastsText}`;
}

export function buildTwoColumnDigestJsonPrompt(opts: {
  previousDigestText: string; // предыдущий дайджест (основной источник для левой колонки)
  weeklyLatestText: string; // последний Weekly (основной источник для правой колонки)
  weeklyAllText: string; // вспомогательно
  allMeetingsText: string; // последние 7 дней
  forecastsText: string; // последние 7 дней
}): string {
  const { previousDigestText, weeklyLatestText, weeklyAllText, allMeetingsText, forecastsText } = opts;
  return `Ты — аналитик. Сформируй ДВУХКОЛОНОЧНЫЙ дайджест по структуре ниже. Ничего не выдумывай, используй только источники.

Верни строго JSON:
{
  "left": {
    "focus": ["что было фокусом прошлой недели (1-5)"],
    "departments": [ { "name": "CRO|Sales|BizDev|Digital Sales|Finance|Project Manager|CSM|Partner|Rev Operations|Marketing", "people": [ { "name": "Имя", "summary": "что сделал/проблемы одной строкой" } ] } ],
    "meetings": [ { "employee": "Имя", "items": [ { "client": "Клиент", "status": "результат 3-5 слов" } ] } ]
  },
  "right": {
    "focus": ["фокус текущей недели (1-5)"],
    "departments": [ { "name": "CRO|Sales|BizDev|Digital Sales|Finance|Project Manager|CSM|Partner|Rev Operations|Marketing", "people": [ { "name": "Имя", "summary": "задачи одной строкой" } ] } ],
    "meetings": [ { "employee": "Имя", "items": [ { "client": "Клиент", "status": "цель/ожидаемый результат 3-5 слов" } ] } ]
  }
}

Источники для левой колонки: ПРЕЖДЕ ВСЕГО предыдущий дайджест, можно дополнять фактами из Weekly_ALL, Meetings_7D, Forecasts_7D.
Источники для правой колонки: ПРЕЖДЕ ВСЕГО последний Weekly. Для встреч правой колонки используй планы/упоминания будущих встреч из Weekly; при отсутствии — оставь пусто.

[PREV_DIGEST]\n${previousDigestText}\n\n[WEEKLY_LATEST]\n${weeklyLatestText}\n\n[WEEKLY_ALL]\n${weeklyAllText}\n\n[MEETINGS_7D]\n${allMeetingsText}\n\n[FORECASTS_7D]\n${forecastsText}`;
}

