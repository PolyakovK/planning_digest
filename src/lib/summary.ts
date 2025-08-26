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

  // Если модель вернула пустой JSON, переключаемся на более устойчивый fallback-промт
  const leftHas = !!(data?.left && ((data.left.focus||[]).length || (data.left.departments||[]).length || (data.left.meetings||[]).length));
  const rightHas = !!(data?.right && ((data.right.focus||[]).length || (data.right.departments||[]).length || (data.right.meetings||[]).length));
  if (!leftHas && !rightHas) {
    const fbPrompt = (await import("@/lib/llm")).buildStructuredDigestJsonPrompt({
      weeklyAllText,
      weeklyLatestText: weeklyPlanningText,
      allMeetingsText,
      forecastsText
    } as any);
    const fbRaw = await generateText(fbPrompt, "gpt-5");
    let fb: any; try { fb = JSON.parse(fbRaw); } catch { fb = {}; }

    const lines: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    lines.push(`📊 Weekly Digest ${today}`);

    const buildList = (items?: string[]) => (Array.isArray(items) ? items.map((x) => `- ${x}`).join("\n") : "");
    const order = ["CRO","Sales","BizDev","Digital Sales","Finance","Project Manager","CSM","Partner","Rev Operations","Marketing"];

    if (Array.isArray(fb.weekStatus) && fb.weekStatus.length) {
      lines.push("\n### 📋 Статус недели");
      lines.push(buildList(fb.weekStatus));
    }
    if (Array.isArray(fb.departments) && fb.departments.length) {
      lines.push("\n### 🏢 Планы отделов на неделю");
      for (const depName of order) {
        const dep = fb.departments.find((d: any) => d?.name === depName);
        if (!dep || !Array.isArray(dep.people) || !dep.people.length) continue;
        lines.push(`\n**${depName}**`);
        for (const p of dep.people) {
          if (!p?.name) continue;
          const parts = [Array.isArray(p.focus)&&p.focus.length?`Фокус: ${p.focus.join(", ")}`: "", Array.isArray(p.tasks)&&p.tasks.length?`Задачи: ${p.tasks.join(", ")}`: ""].filter(Boolean).join("; ");
          lines.push(`- ${p.name}${parts?": "+parts:""}`);
        }
      }
    }
    if (Array.isArray(fb.keyMeetings) && fb.keyMeetings.length) {
      lines.push("\n### 💼 Ключевые встречи");
      for (const a of fb.keyMeetings) {
        if (!Array.isArray(a.clients) || !a.clients.length) continue;
        lines.push(`\n**${a.employee}**`);
        for (const c of a.clients) lines.push(`- ${c.name}: ${c.status}`);
      }
    }
    return lines.join("\n");
  }

  // 2) Рендерим Markdown: таблица 2 колонки
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`📊 Weekly Digest ${today}`);

  // Для Notion избежим markdown-таблиц — отрисуем колонками через toggle + child columns
  const buildList = (items?: string[]) => (Array.isArray(items) ? items.map((x) => `- ${x}`).join("\n") : "");
  const order = ["CRO","Sales","BizDev","Digital Sales","Finance","Project Manager","CSM","Partner","Rev Operations","Marketing"];

  // Фокус (две колонки с разделителем)
  lines.push("\n### 🎯 Фокус прошлой недели / этой недели");
  lines.push("<columns>");
  lines.push("**🎯 Фокус прошлой недели**\n" + buildList(data?.left?.focus));
  lines.push("<vsep/>");
  lines.push("**🎯 Фокус этой недели**\n" + buildList(data?.right?.focus));
  lines.push("</columns>");

  // Отделы (две колонки с заголовками слева/справа)
  lines.push("\n### 🏢 Итоги отделов / Планы отделов");
  for (const dep of order) {
    const leftDep = (data?.left?.departments || []).find((d: any) => d?.name === dep);
    const rightDep = (data?.right?.departments || []).find((d: any) => d?.name === dep);
    const leftPeople = Array.isArray(leftDep?.people) ? leftDep.people.map((p: any) => `- ${normalizeName(p.name)}: ${p.summary}`).join("\n") : "";
    const rightPeople = Array.isArray(rightDep?.people) ? rightDep.people.map((p: any) => `- ${normalizeName(p.name)}: ${p.summary}`).join("\n") : "";
    lines.push("<columns>");
    lines.push("**" + dep + "**\n" + leftPeople);
    lines.push("<vsep/>");
    lines.push("**" + dep + "**\n" + rightPeople);
    lines.push("</columns>");
  }

  // Встречи (две колонки)
  const leftMeet = Array.isArray(data?.left?.meetings) ? data.left.meetings : [];
  const rightMeet = Array.isArray(data?.right?.meetings) ? data.right.meetings : [];
  const maxMeet = Math.max(leftMeet.length, rightMeet.length);
  lines.push("\n### 💼 Прошедшие встречи / Запланированные встречи");
  for (let i = 0; i < maxMeet; i++) {
    const l = leftMeet[i];
    const r = rightMeet[i];
    const lTitle = l?.employee ? `**${normalizeName(l.employee)}**\n` : "";
    const rTitle = r?.employee ? `**${normalizeName(r.employee)}**\n` : "";
    const lItems = l ? (l.items || []).map((x: any) => `- ${x.client}: ${x.status}`).join("\n") : "";
    const rItems = r ? (r.items || []).map((x: any) => `- ${x.client}: ${x.status}`).join("\n") : "";
    lines.push("<columns>");
    lines.push(lTitle + lItems);
    lines.push("<vsep/>");
    lines.push(rTitle + rItems);
    lines.push("</columns>");
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


