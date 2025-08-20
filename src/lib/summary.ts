import { runtimeConfig } from "@/lib/env";
import { getPageMarkdown } from "@/lib/notion";
import { buildWeeklyDigestPrompt, buildWeeklyTasksExtractionPrompt, generateText } from "@/lib/llm";

export async function collectSourceTexts() {
  const weeklyPlanningId = runtimeConfig.notion.weeklyPlanningPageId();
  const allMeetingsId = runtimeConfig.notion.allMeetingsPageId();
  const forecastsId = runtimeConfig.notion.forecastsPageId();

  const [weeklyPlanningText, allMeetingsText, forecastsText] = await Promise.all([
    getPageMarkdown(weeklyPlanningId),
    getPageMarkdown(allMeetingsId),
    getPageMarkdown(forecastsId)
  ]);

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


