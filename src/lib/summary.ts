import { runtimeConfig } from "@/lib/env";
import { getPageMarkdown } from "@/lib/notion";
import { buildWeeklyDigestPrompt, buildWeeklyTasksExtractionPrompt, generateText } from "@/lib/llm";

export async function collectSourceTexts() {
  const weeklyPlanningRoot = runtimeConfig.notion.weeklyPlanningPageId();
  const meetingsRoot = runtimeConfig.notion.allMeetingsPageId();
  const forecastsRoot = runtimeConfig.notion.forecastsPageId();

  // Weekly Planning: глубина 2 (раздел -> последняя страница недели)
  const weeklyPlanningText = await getPageMarkdown(weeklyPlanningRoot, 2);

  // Meetings: глубина 3, чтобы обойти вложенные разделы сотрудников
  const allMeetingsText = await getPageMarkdown(meetingsRoot, 3);

  // Forecasts: глубина 2
  const forecastsText = await getPageMarkdown(forecastsRoot, 2);

  return { weeklyPlanningText, allMeetingsText, forecastsText };
}

export async function buildDigestMarkdown() {
  const { weeklyPlanningText, allMeetingsText, forecastsText } = await collectSourceTexts();
  const prompt = buildWeeklyDigestPrompt({ weeklyPlanningText, allMeetingsText, forecastsText });
  const digest = await generateText(prompt);
  return digest.trim();
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


