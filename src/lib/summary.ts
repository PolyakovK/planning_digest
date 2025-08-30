import { runtimeConfig } from "@/lib/env";
import { getMeetingsRawForLastDays } from "@/lib/notion";
import { buildLinearMeetingsPrompt, generateText } from "@/lib/llm";
import { fetchIssuesByTeams, groupIssuesForDigest, fetchIssuesByProjectId } from "@/lib/linear";

// Meetings text (7 days)
async function collectMeetingsText(): Promise<string> {
  const meetingsRoot = runtimeConfig.notion.allMeetingsPageId();
  const allMeetingsText = await getMeetingsRawForLastDays(meetingsRoot, 7);
  return allMeetingsText;
}

export async function buildDigestMarkdown() {
  // 1) Linear: задачи по командам (все команды Revenue)
  const issuesByTeam = await fetchIssuesByTeams(runtimeConfig.linear.teamIds());
  const grouped = groupIssuesForDigest(issuesByTeam);

  // 2) Linear: проект Documents — подписанные/платежи за 7 дней
  const docsIssues = await fetchIssuesByProjectId(runtimeConfig.linear.documentsProjectId());
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const within7d = (iso: string) => now - new Date(iso).getTime() <= sevenDays;
  const docSigned = docsIssues
    .filter((i) => (i.state?.name?.toLowerCase() === "done" || i.state?.name?.toLowerCase() === "completed") && within7d(i.updatedAt) && i.title.toLowerCase().includes("подпис"))
    .map((i) => (i.description ? `${i.title}: ${i.description}` : i.title));
  const docPayments = docsIssues
    .filter((i) => (i.state?.name?.toLowerCase() === "done" || i.state?.name?.toLowerCase() === "completed") && within7d(i.updatedAt) && (i.title.toLowerCase().includes("получен") || i.title.toLowerCase().includes("оплата")))
    .map((i) => (i.description ? `${i.title}: ${i.description}` : i.title));

  // 3) Notion: встречи (7 дней)
  const meetingsText = await collectMeetingsText();

  // 4) LLM: строгий JSON (departments + documents + meetings)
  const jsonPrompt = buildLinearMeetingsPrompt({
    linear: JSON.stringify({ grouped, documents: { signed: docSigned, received_payments: docPayments } }, null, 2),
    meetings: meetingsText
  });
  const jsonRaw = await generateText(jsonPrompt, "gpt-5");
  let data: any; try { data = JSON.parse(jsonRaw); } catch { data = {}; }

  // 5) Рендер
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`📊 Weekly Digest ${today}`);

  // 5.1 Документы / Платежи
  lines.push("\n### 📄 Подписанные документы за неделю");
  const signedList = data?.documents?.signed as string[] | undefined;
  if (Array.isArray(signedList) && signedList.length) signedList.forEach((x) => lines.push(`- ${x}`));
  else lines.push("- Обновлений за неделю нет");

  lines.push("\n### 💰 Полученные деньги");
  const payList = (data?.documents?.received_payments as string[] | undefined) || (data?.documents?.payments as string[] | undefined);
  if (Array.isArray(payList) && payList.length) payList.forEach((x) => lines.push(`- ${x}`));
  else lines.push("- Обновлений за неделю нет");

  // 5.2 Итоги и Фокус (самые важные по всем отделам)
  const order = [
    "CRO",
    "Sales",
    "BizDev",
    "Digital Sales",
    "Finance",
    "Project Manager",
    "CSM",
    "Partner",
    "Rev Operations",
    "Marketing"
  ];
  lines.push("\n### 🏢 Итоги и Фокус");
  const topCompleted: string[] = [];
  const topPlanned: string[] = [];
  for (const dep of order) {
    const d = data?.departments?.[dep];
    if (!d) continue;
    if (Array.isArray(d.completed)) topCompleted.push(...d.completed.slice(0, 2));
    if (Array.isArray(d.planned)) topPlanned.push(...d.planned.slice(0, 2));
  }
  lines.push("<columns>");
  lines.push("**Итоги прошлой недели**\n" + (topCompleted.length ? topCompleted.map((x) => `- ${x}`).join("\n") : "- Обновлений за неделю нет"));
  lines.push("<vsep/>");
  lines.push("**Фокус недели**\n" + (topPlanned.length ? topPlanned.map((x) => `- ${x}`).join("\n") : "- Обновлений за неделю нет"));
  lines.push("</columns>");

  // 5.3 Итоги / Планы по командам
  lines.push("\n### 🏢 Итоги / Планы по командам");
  for (const dep of order) {
    const d = data?.departments?.[dep];
    if (!d) continue;
    const completed = Array.isArray(d.completed) && d.completed.length ? d.completed.map((x: string) => `- ${x}`).join("\n") : "- Обновлений за неделю нет";
    const planned = Array.isArray(d.planned) && d.planned.length ? d.planned.map((x: string) => `- ${x}`).join("\n") : "- Обновлений за неделю нет";
    lines.push("<columns>");
    lines.push(`**${dep} — Итоги**\n${completed}`);
    lines.push("<vsep/>");
    lines.push(`**${dep} — Планы**\n${planned}`);
    lines.push("</columns>");
  }

  // 5.4 Встречи (сводка по отделам)
  lines.push("\n### 💼 Встречи");
  if (data?.meetings) {
    for (const [owner, m] of Object.entries<any>(data.meetings)) {
      lines.push(`\n**${owner}**`);
      if (m.total_meetings !== undefined) lines.push(`- Всего встреч: ${m.total_meetings}`);
      if (Array.isArray(m.key_clients)) lines.push(`- Ключевые клиенты: ${m.key_clients.join(", ")}`);
      if (m.main_goals) lines.push(`- Основные цели: ${m.main_goals}`);
      if (m.results) lines.push(`- Результаты: ${m.results}`);
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


