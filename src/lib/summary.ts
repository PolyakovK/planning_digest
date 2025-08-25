import { runtimeConfig } from "@/lib/env";
import { getLatestChildPageMarkdownByDate, getMeetingsRawForLastDays, getForecastsRawAggregate, getForecastsListForLastDays, getPageMarkdown, listChildPages } from "@/lib/notion";
import { buildTwoColumnDigestJsonPrompt, buildWeeklyTasksExtractionPrompt, generateText } from "@/lib/llm";

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
  // Получаем предыдущий дайджест из корневой страницы дайджестов
  const digestRoot = runtimeConfig.digest.targetPageId();
  const prev = await getLatestChildPageMarkdownByDate(digestRoot);
  const previousDigestText = prev?.markdown ?? "";

  // 1) Структурируем данные в JSON (двухколоночный)
  const jsonPrompt = buildTwoColumnDigestJsonPrompt({
    previousDigestText,
    weeklyLatestText: weeklyPlanningText,
    weeklyAllText,
    allMeetingsText,
    forecastsText
  });
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

  // 2) Рендерим Markdown: таблица 2 колонки
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`📊 Weekly Digest ${today}`);

  const pad = (text?: string) => (text ? text : "");

  lines.push("\n| **📋 ПРОШЛАЯ НЕДЕЛЯ** | **🎯 ТЕКУЩАЯ НЕДЕЛЯ** |\n|---|---|");

  // Фокусы
  const leftFocus = Array.isArray(data?.left?.focus) ? data.left.focus.map((x: string) => `• ${x}`).join("<br/>") : "";
  const rightFocus = Array.isArray(data?.right?.focus) ? data.right.focus.map((x: string) => `• ${x}`).join("<br/>") : "";
  lines.push(`| **🎯 Фокус прошлой недели** | **🎯 Фокус этой недели** |`);
  lines.push(`| ${pad(leftFocus)} | ${pad(rightFocus)} |`);
  lines.push(`|  |  |`);

  // Итоги/Планы отделов
  lines.push(`| **🏢 Итоги отделов** | **🏢 Планы отделов** |`);
  const order = ["CRO","Sales","BizDev","Digital Sales","Finance","Project Manager","CSM","Partner","Rev Operations","Marketing"];
  for (const dep of order) {
    const leftDep = (data?.left?.departments || []).find((d: any) => d?.name === dep);
    const rightDep = (data?.right?.departments || []).find((d: any) => d?.name === dep);
    const leftPeople = Array.isArray(leftDep?.people) ? leftDep.people.map((p: any) => `• ${normalizeName(p.name)}: ${p.summary}`).join("<br/>") : "";
    const rightPeople = Array.isArray(rightDep?.people) ? rightDep.people.map((p: any) => `• ${normalizeName(p.name)}: ${p.summary}`).join("<br/>") : "";
    lines.push(`| **${dep}** | **${dep}** |`);
    lines.push(`| ${pad(leftPeople)} | ${pad(rightPeople)} |`);
  }

  // Встречи
  lines.push(`| **💼 Прошедшие встречи** | **💼 Запланированные встречи** |`);
  const leftMeet = Array.isArray(data?.left?.meetings) ? data.left.meetings : [];
  const rightMeet = Array.isArray(data?.right?.meetings) ? data.right.meetings : [];
  const maxRows = Math.max(leftMeet.length, rightMeet.length);
  for (let i = 0; i < maxRows; i++) {
    const l = leftMeet[i];
    const r = rightMeet[i];
    const lTitle = l?.employee ? `**${normalizeName(l.employee)}**` : "";
    const rTitle = r?.employee ? `**${normalizeName(r.employee)}**` : "";
    lines.push(`| ${pad(lTitle)} | ${pad(rTitle)} |`);
    const lItems = Array.isArray(l?.items) ? l.items.map((x: any) => `• ${x.client}: ${x.status}`).join("<br/>") : "";
    const rItems = Array.isArray(r?.items) ? r.items.map((x: any) => `• ${x.client}: ${x.status}`).join("<br/>") : "";
    lines.push(`| ${pad(lItems)} | ${pad(rItems)} |`);
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


