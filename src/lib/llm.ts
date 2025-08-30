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

// Final strict prompt: sources only Linear (Revenue teams + Documents project) and Notion Meetings (7 days)
export function buildLinearMeetingsPrompt(opts: { linear: string; meetings: string }): string {
  const { linear, meetings } = opts;
  return `Ты — аналитик, готовящий компактный еженедельный дайджест для руководства. ИСПОЛЬЗУЙ ТОЛЬКО:
- Linear: все команды Revenue (все проекты) + проект "Documents"
- Notion: раздел "Все встречи" за последние 7 дней
НЕ ПРИДУМЫВАЙ ДАННЫЕ.

Верни строго JSON (только JSON без комментариев):
{
  "documents": {
    "signed": ["Название документа: краткий статус"],
    "received_payments": ["Название платежа: сумма/статус"]
  },
  "highlights_focus": {
    "past_week": ["3-5 важнейших бизнес-итогов из Linear задач Done (7 дней)"],
    "current_week": ["3-5 важнейших фокусов из Linear задач Todo/In Progress/In Review"]
  },
  "departments": {
    "CRO": { "completed": ["задача: итог и почему это важно"], "planned": ["задача: план и обоснование"] },
    "Sales": { "completed": [], "planned": [] },
    "BizDev": { "completed": [], "planned": [] },
    "Digital Sales": { "completed": [], "planned": [] },
    "Finance": { "completed": [], "planned": [] },
    "Project Manager": { "completed": [], "planned": [] },
    "CSM": { "completed": [], "planned": [] },
    "Partner": { "completed": [], "planned": [] },
    "Rev Operations": { "completed": [], "planned": [] },
    "Marketing": { "completed": [], "planned": [] }
  },
  "meetings": {
    "Sales": {
      "total_meetings": 0,
      "key_clients": ["клиент1", "клиент2"],
      "main_goals": "кратко цели",
      "results": "кратко результаты"
    }
  }
}

Правила заполнения:
- documents: только задачи проекта "Documents" со статусом Done за 7 дней. Распределяй по спискам "signed" и "received_payments". Если данных нет — верни массив ["Обновлений за неделю нет"].
- highlights_focus: формируй краткие бизнес-формулировки; избегай тех. терминов. Источники — только Linear задачи по всем Revenue-командам.
- departments: для каждого отдела сформируй completed (Done за 7 дней) и planned (Todo/In Progress/In Review и др., кроме Backlog). Каждая формулировка — полным предложением, с контекстом и обоснованием важности.
- meetings: формируй строго по Notion "Все встречи" за 7 дней: количество, ключевые клиенты, цели и результаты. Если данных нет по отделу — пропусти этот отдел.
- Если раздел пуст — не включай его ключ вовсе, кроме documents (там при отсутствии — верни массив с одним элементом "Обновлений за неделю нет").

ДАННЫЕ_ИЗ_LINEAR:
${linear}

ДАННЫЕ_ИЗ_MEETINGS_7D:
${meetings}`;
}

