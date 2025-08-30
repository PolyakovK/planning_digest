import { runtimeConfig } from "@/lib/env";
import { getMeetingsRawForLastDays } from "@/lib/notion";
import { buildLinearMeetingsPrompt, generateText } from "@/lib/llm";
import { fetchIssuesByTeams, groupIssuesForDigest, fetchIssuesByProjectId, fetchDocumentsUpdates } from "@/lib/linear";

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

  // 2) Linear: проект Documents — считаем обновления из комментариев за 7 дней
  const documents = await fetchDocumentsUpdates(runtimeConfig.linear.documentsProjectId(), 7);

  // 3) Notion: встречи (7 дней)
  const meetingsText = await collectMeetingsText();

  // 4) LLM: строгий JSON (departments + documents + meetings)
  const jsonPrompt = buildLinearMeetingsPrompt({
    linear: JSON.stringify({ grouped, documents }, null, 2),
    meetings: meetingsText
  });
  const jsonRaw = await generateText(jsonPrompt, "gpt-5");
  let data: any; try { data = JSON.parse(jsonRaw); } catch { data = {}; }

  // Helpers for table cells
  const cell = (items?: string[]) => {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return "Обновлений за неделю нет";
    return arr.map((x) => x.replace(/\|/g, "\\|")).join("<br/>");
  };

  // 5) Рендер по точной структуре
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`# 📊 Weekly Digest ${today}`);

  // 5.1 Финансовые результаты
  lines.push("\n## 💰 Финансовые результаты");
  lines.push("**Подписанные документы за неделю:**");
  const signedList = data?.documents?.signed as string[] | undefined;
  if (Array.isArray(signedList) && signedList.length) signedList.forEach((x) => lines.push(`- ${x}`));
  else lines.push("- Обновлений за неделю нет");

  lines.push("\n**Полученные деньги за неделю:**");
  const payList = (data?.documents?.received_payments as string[] | undefined);
  if (Array.isArray(payList) && payList.length) payList.forEach((x) => lines.push(`- ${x}`));
  else lines.push("- Обновлений за неделю нет");

  // 5.2 Итоги и Фокус недели (таблица) — используем highlights_focus из LLM
  lines.push("\n## 🎯 Итоги и Фокус недели");
  const pastHighlights = data?.highlights_focus?.past_week as string[] | undefined;
  const currentFocus = data?.highlights_focus?.current_week as string[] | undefined;
  const completedCell = cell(pastHighlights);
  const plannedCell = cell(currentFocus);
  lines.push(`| **Итоги прошлой недели** | **Фокус этой недели** |`);
  lines.push(`|-------------------------|----------------------|`);
  lines.push(`| ${completedCell} | ${plannedCell} |`);

  // 5.3 Итоги / Планы по командам (таблицы по отделам)
  lines.push("\n## 🏢 Итоги / Планы по командам");
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
  for (const dep of order) {
    const d = data?.departments?.[dep];
    if (!d) continue;
    lines.push(`\n**${dep}**`);
    const depCompleted = cell(Array.isArray(d.completed) ? d.completed : []);
    const depPlanned = cell(Array.isArray(d.planned) ? d.planned : []);
    lines.push(`| **Итоги** | **Планы** |`);
    lines.push(`|-----------|-----------|`);
    lines.push(`| ${depCompleted} | ${depPlanned} |`);
  }

  // 5.4 Встречи (сводка по отделам)
  lines.push("\n## 💼 Встречи");
  if (data?.meetings) {
    for (const [owner, m] of Object.entries<any>(data.meetings)) {
      const clients = Array.isArray(m.key_clients) ? m.key_clients.join(", ") : "";
      const total = m.total_meetings !== undefined ? m.total_meetings : 0;
      const goals = m.main_goals ? m.main_goals : "—";
      lines.push(`**${owner}**: ${total} встреч с [${clients}], цели: ${goals}`);
    }
  }

  return lines.join("\n");
}


