import { runtimeConfig } from "@/lib/env";
import { getLatestChildPageMarkdownByDate, getMeetingsRawForLastDays, getForecastsRawAggregate, getForecastsListForLastDays, getPageMarkdown, listChildPages } from "@/lib/notion";
import { buildWeeklyDigestPrompt, buildWeeklyTasksExtractionPrompt, buildStructuredDigestJsonPrompt, generateText } from "@/lib/llm";

export async function collectSourceTexts() {
  const weeklyPlanningRoot = runtimeConfig.notion.weeklyPlanningPageId();
  const meetingsRoot = runtimeConfig.notion.allMeetingsPageId();
  const forecastsRoot = runtimeConfig.notion.forecastsPageId();

  // Weekly Planning: возьмем последнюю по дате страницу внутри раздела
  const latestWeekly = await getLatestChildPageMarkdownByDate(weeklyPlanningRoot);
  const weeklyPlanningText = latestWeekly?.markdown ?? (await getPageMarkdown(weeklyPlanningRoot, 2));
  const weeklyPages = await listChildPages(weeklyPlanningRoot);
  const weeklyAllText = (
    await Promise.all(weeklyPages.map((p) => getPageMarkdown(p.id, 1)))
  ).join("\n\n");

  // Meetings: только последние 7 дней, агрегировано по владельцам
  const allMeetingsText = await getMeetingsRawForLastDays(meetingsRoot, 7);

  // Forecasts: только за последние 7 дней
  const forecastsText = await getForecastsRawAggregate(forecastsRoot, 7, 10);

  return { weeklyPlanningText, weeklyAllText, allMeetingsText, forecastsText };
}

export async function buildDigestMarkdown() {
  const { weeklyPlanningText, weeklyAllText, allMeetingsText, forecastsText } = await collectSourceTexts();
  // 1) Структурируем данные в JSON
  const jsonPrompt = buildStructuredDigestJsonPrompt({ weeklyAllText, weeklyLatestText: weeklyPlanningText, allMeetingsText, forecastsText });
  const jsonRaw = await generateText(jsonPrompt, "gpt-5");
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

  const shorten = (text: string, maxWords = 7) => {
    if (!text) return "";
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "…" : words.join(" ");
  };

  // Статус недели
  if (Array.isArray(data.weekStatus) && data.weekStatus.length) {
    lines.push("\n### 📋 Статус недели");
    for (const s of data.weekStatus) lines.push(`- ${s}`);
  }

  // Метрики недели удалены по требованиям — не выводим

  // Убрали отдельные риски/форкасты по новой структуре

  if (Array.isArray(data.departments) && data.departments.length) {
    lines.push("\n### 🏢 Планы отделов на неделю");
    for (const dep of data.departments) {
      if (!Array.isArray(dep.people) || dep.people.length === 0) continue;
      // Заголовок отдела
      if (dep.name) lines.push(`\n**${dep.name}**`);
      // Сотрудники как пункты списка в формате "- Имя: Фокус ...; Задачи ..."
      for (const p of dep.people) {
        if (!p?.name) continue;
        const focus = Array.isArray(p.focus) && p.focus.length ? `Фокус: ${p.focus.join(", ")}` : "";
        const tasks = Array.isArray(p.tasks) && p.tasks.length ? `Задачи: ${p.tasks.join(", ")}` : "";
        const details = [focus, tasks].filter(Boolean).join("; ");
        lines.push(`- ${p.name}${details ? ": " + details : ""}`);
      }
    }
  }

  // Форкасты скрыты по новой структуре

  if (Array.isArray(data.keyMeetings) && data.keyMeetings.length) {
    lines.push("\n### 💼 Ключевые встречи");
    for (const a of data.keyMeetings) {
      const hasClients = Array.isArray(a.clients) && a.clients.length > 0;
      const hasMeetings = Array.isArray(a.meetings) && a.meetings.length > 0;
      if (!hasClients && !hasMeetings) continue;
      lines.push(`\n**${a.employee}**`);
      if (hasClients) {
        for (const c of a.clients) {
          if (!c?.name) continue;
          const status = c?.status ? `: ${shorten(String(c.status))}` : "";
          lines.push(`- ${c.name}${status}`);
        }
      } else if (hasMeetings) {
        for (const m of a.meetings) {
          const rawTitle: string = String(m?.title || "");
          let client = rawTitle.split(" x ")[0] || rawTitle;
          client = client.split(" — ")[0].split(":")[0].trim();
          const base = String(m?.result || m?.question || "");
          const status = shorten(base);
          if (client) lines.push(`- ${client}${status ? ": " + status : ""}`);
        }
      }
    }
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


