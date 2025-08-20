import { runtimeConfig } from "@/lib/env";
import { getLatestChildPageMarkdownByDate, getMeetingsRawForLastDays, getForecastsRawAggregate, getForecastsListForLastDays, getPageMarkdown } from "@/lib/notion";
import { buildWeeklyDigestPrompt, buildWeeklyTasksExtractionPrompt, buildStructuredDigestJsonPrompt, generateText } from "@/lib/llm";

export async function collectSourceTexts() {
  const weeklyPlanningRoot = runtimeConfig.notion.weeklyPlanningPageId();
  const meetingsRoot = runtimeConfig.notion.allMeetingsPageId();
  const forecastsRoot = runtimeConfig.notion.forecastsPageId();

  // Weekly Planning: возьмем последнюю по дате страницу внутри раздела
  const latestWeekly = await getLatestChildPageMarkdownByDate(weeklyPlanningRoot);
  const weeklyPlanningText = latestWeekly?.markdown ?? (await getPageMarkdown(weeklyPlanningRoot, 2));

  // Meetings: только последние 7 дней, агрегировано по владельцам
  const allMeetingsText = await getMeetingsRawForLastDays(meetingsRoot, 7);

  // Forecasts: только за последние 7 дней
  const forecastsText = await getForecastsRawAggregate(forecastsRoot, 7, 10);

  return { weeklyPlanningText, allMeetingsText, forecastsText };
}

export async function buildDigestMarkdown() {
  const { weeklyPlanningText, allMeetingsText, forecastsText } = await collectSourceTexts();
  // 1) Структурируем данные в JSON
  const jsonPrompt = buildStructuredDigestJsonPrompt({ weeklyPlanningText, allMeetingsText, forecastsText });
  const jsonRaw = await generateText(jsonPrompt);
  let data: any;
  try { data = JSON.parse(jsonRaw); } catch { data = {}; }

  // Нормализация имен: Кирилл/Кира = один человек
  const normalizeName = (name: string): string => {
    const base = (name || "").trim();
    if (/^(Кирилл|Кира)\b/i.test(base)) return "Кирилл / Кира";
    return base;
  };

  // Объединяем людей с одинаковыми нормализованными именами в отделах
  if (Array.isArray(data.departments)) {
    for (const dep of data.departments) {
      if (!Array.isArray(dep.people)) continue;
      const merged: Record<string, { name: string; focus: string[]; tasks: string[] }> = {};
      for (const p of dep.people) {
        const key = normalizeName(p?.name);
        if (!key) continue;
        if (!merged[key]) merged[key] = { name: key, focus: [], tasks: [] };
        if (Array.isArray(p?.focus)) merged[key].focus.push(...p.focus);
        if (Array.isArray(p?.tasks)) merged[key].tasks.push(...p.tasks);
      }
      // Deduplicate
      dep.people = Object.values(merged).map((x) => ({
        name: x.name,
        focus: Array.from(new Set(x.focus.filter(Boolean))),
        tasks: Array.from(new Set(x.tasks.filter(Boolean)))
      }));
    }
  }

  // Объединяем активность клиентов по нормализованным именам
  if (Array.isArray(data.clientActivity)) {
    const merged: Record<string, { employee: string; meetings: any[] }> = {};
    for (const a of data.clientActivity) {
      const key = normalizeName(a?.employee);
      if (!key) continue;
      if (!merged[key]) merged[key] = { employee: key, meetings: [] };
      if (Array.isArray(a?.meetings)) merged[key].meetings.push(...a.meetings);
    }
    data.clientActivity = Object.values(merged);
  }

  // 2) Рендерим Markdown с визуальной структурой и эмодзи
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`📊 Weekly Digest ${today}`);

  if (Array.isArray(data.highlights) && data.highlights.length) {
    lines.push("\n### 🎯 Ключевые итоги недели");
    for (const h of data.highlights) lines.push(`- ${h}`);
  }

  // Метрики недели удалены по требованиям — не выводим

  if (Array.isArray(data.departments) && data.departments.length) {
    lines.push("\n### 🏢 Планы отделов на неделю");
    for (const dep of data.departments) {
      if (!Array.isArray(dep.people)) continue;
      for (const p of dep.people) {
        if (!p?.name) continue;
        lines.push(`\n**${p.name}**`);
        if (Array.isArray(p.focus) && p.focus.length) lines.push(`Фокус: ${p.focus.join(", ")}`);
        if (Array.isArray(p.tasks) && p.tasks.length) lines.push(`Прочие: ${p.tasks.join(", ")}`);
      }
    }
  }

  if (Array.isArray(data.clientActivity) && data.clientActivity.length) {
    lines.push("\n### 💼 Активность с клиентами");
    for (const a of data.clientActivity) {
      if (!Array.isArray(a.meetings) || a.meetings.length === 0) continue;
      lines.push(`\n**${a.employee}**`);
      for (const m of a.meetings) {
        const parts: string[] = [];
        if (m.title) parts.push(m.title);
        if (m.question) parts.push(`Вопрос: ${m.question}`);
        if (m.result) parts.push(`Результат: ${m.result}`);
        if (parts.length) lines.push(`- ${parts.join(" — ")}`);
      }
    }
  }

  if (Array.isArray(data.forecastsSummary) && data.forecastsSummary.length) {
    lines.push("\n### 🔮 Форкасты отделов");
    for (const f of data.forecastsSummary) lines.push(`- ${f}`);
  }

  if (Array.isArray(data.attention) && data.attention.length) {
    lines.push("\n### ⚠️ Внимание требует");
    for (const r of data.attention) lines.push(`- ${r}`);
  }

  return lines.join("\n");
}

export type LinearTasksPayload = {
  employees: Array<{
    name: string;
    tasks: Array<{ title: string; description?: string }>;
  }>;
};

export async function extractWeeklyTasks(): Promise<LinearTasksPayload> {
  const weeklyPlanningId = runtimeConfig.notion.weeklyPlanningPageId();
  const weeklyPlanningText = await getPageMarkdown(weeklyPlanningId);
  const prompt = buildWeeklyTasksExtractionPrompt(weeklyPlanningText);
  const json = await generateText(prompt);
  try {
    const parsed = JSON.parse(json) as LinearTasksPayload;
    return parsed;
  } catch (e) {
    throw new Error("Failed to parse tasks JSON from LLM");
  }
}


