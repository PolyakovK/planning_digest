import { runtimeConfig } from "@/lib/env";
import { getLatestChildPageMarkdownByDate, getMeetingsRawForLastDays, getForecastsRawAggregate, getForecastsListForLastDays, getPageMarkdown } from "@/lib/notion";
import { buildWeeklyDigestPrompt, buildWeeklyTasksExtractionPrompt, generateText } from "@/lib/llm";

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
  const prompt = buildWeeklyDigestPrompt({ weeklyPlanningText, allMeetingsText, forecastsText });
  const digestRaw = (await generateText(prompt)).trim();
  // Post-format: normalize line breaks, remove double spaces
  const digest = digestRaw
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, (m) => (m.includes(" ") ? " " : m))
    .replace(/\n{3,}/g, "\n\n");

  // Replace headings-like lines for H3 style (###) while keeping Notion-friendly formatting
  const lines = digest.split("\n");
  const polished: string[] = [];
  for (const line of lines) {
    if (/^[A-ZА-Я0-9 _()\/\-]{6,}$/.test(line) && !line.startsWith("- ")) {
      polished.push(`### ${line}`);
    } else {
      polished.push(line);
    }
  }

  // Append clean Forecasts list with links under a dedicated section
  const forecastsRoot = runtimeConfig.notion.forecastsPageId();
  const list = await getForecastsListForLastDays(forecastsRoot, 7);
  if (list.length > 0) {
    polished.push("\n### ФОРКАСТЫ ЗА 7 ДНЕЙ");
    for (const item of list) {
      const dateStr = item.date ? item.date.toISOString().slice(0, 10) : "";
      if (item.url) polished.push(`- ${item.title} (${dateStr}) — ${item.url}`);
      else polished.push(`- ${item.title} (${dateStr})`);
    }
  }

  return polished.join("\n");
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


