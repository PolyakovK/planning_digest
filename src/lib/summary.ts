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

  // Для Notion избежим markdown-таблиц — отрисуем колонками через toggle + child columns
  const buildList = (items?: string[]) => (Array.isArray(items) ? items.map((x) => `- ${x}`).join("\n") : "");
  const order = ["CRO","Sales","BizDev","Digital Sales","Finance","Project Manager","CSM","Partner","Rev Operations","Marketing"];

  // Фокус (таблица)
  lines.push(`\n<table title="🎯 Фокус">`);
  lines.push(`<headers>Прошлая неделя|Текущая неделя</headers>`);
  const leftFocusRows = Array.isArray(data?.left?.focus) ? data.left.focus : [];
  const rightFocusRows = Array.isArray(data?.right?.focus) ? data.right.focus : [];
  const maxFocus = Math.max(leftFocusRows.length, rightFocusRows.length);
  for (let i = 0; i < maxFocus; i++) {
    lines.push(`<row>${leftFocusRows[i] || ""}|${rightFocusRows[i] || ""}</row>`);
  }
  lines.push(`</table>`);

  // Отделы (таблица на отдел)
  lines.push(`\n<table title="🏢 Итоги и планы">`);
  lines.push(`<headers>Итоги отделов|Планы отделов</headers>`);
  for (const dep of order) {
    const leftDep = (data?.left?.departments || []).find((d: any) => d?.name === dep);
    const rightDep = (data?.right?.departments || []).find((d: any) => d?.name === dep);
    const leftPeople = Array.isArray(leftDep?.people) ? leftDep.people.map((p: any) => `${normalizeName(p.name)}: ${p.summary}`).join("; ") : "";
    const rightPeople = Array.isArray(rightDep?.people) ? rightDep.people.map((p: any) => `${normalizeName(p.name)}: ${p.summary}`).join("; ") : "";
    if (leftPeople || rightPeople) lines.push(`<row>${dep}: ${leftPeople}|${dep}: ${rightPeople}</row>`);
  }
  lines.push(`</table>`);

  // Встречи (таблица)
  const leftMeet = Array.isArray(data?.left?.meetings) ? data.left.meetings : [];
  const rightMeet = Array.isArray(data?.right?.meetings) ? data.right.meetings : [];
  lines.push(`\n<table title="💼 Встречи">`);
  lines.push(`<headers>Прошедшие встречи|Запланированные встречи</headers>`);
  const maxMeet = Math.max(leftMeet.length, rightMeet.length);
  for (let i = 0; i < maxMeet; i++) {
    const l = leftMeet[i];
    const r = rightMeet[i];
    const lStr = l ? `${normalizeName(l.employee)} — ${(l.items||[]).map((x:any)=>`${x.client}: ${x.status}`).join("; ")}` : "";
    const rStr = r ? `${normalizeName(r.employee)} — ${(r.items||[]).map((x:any)=>`${x.client}: ${x.status}`).join("; ")}` : "";
    lines.push(`<row>${lStr}|${rStr}</row>`);
  }
  lines.push(`</table>`);

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


