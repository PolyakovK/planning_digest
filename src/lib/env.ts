type RequiredEnv =
  | "NOTION_TOKEN"
  | "NOTION_PAGE_WEEKLY_PLANNING_ID"
  | "NOTION_PAGE_ALL_MEETINGS_ID"
  | "NOTION_PAGE_FORECASTS_ID"
  | "DIGEST_NOTION_TARGET_PAGE_ID"
  | "OPENAI_API_KEY"
  | "LINEAR_API_KEY"
  | "LINEAR_TEAM_ID"
  | "LINEAR_PROJECT_ID";

export function getEnv(name: RequiredEnv | string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const runtimeConfig = {
  notion: {
    token: () => getEnv("NOTION_TOKEN"), // TODO: Add to .env
    weeklyPlanningPageId: () => getEnv("NOTION_PAGE_WEEKLY_PLANNING_ID"), // TODO: Add to .env
    allMeetingsPageId: () => getEnv("NOTION_PAGE_ALL_MEETINGS_ID"), // TODO: Add to .env
    forecastsPageId: () => getEnv("NOTION_PAGE_FORECASTS_ID") // TODO: Add to .env
  },
  digest: {
    targetPageId: () => getEnv("DIGEST_NOTION_TARGET_PAGE_ID"), // TODO: Add to .env
    timezone: () => process.env.DIGEST_TIMEZONE || "Europe/Moscow"
  },
  openai: {
    apiKey: () => getEnv("OPENAI_API_KEY"), // TODO: Add to .env
    model: () => process.env.OPENAI_MODEL || "gpt-5-mini"
  },
  linear: {
    apiKey: () => getEnv("LINEAR_API_KEY"), // TODO: Add to .env
    teamId: () => getEnv("LINEAR_TEAM_ID"), // TODO: Add to .env
    projectId: () => getEnv("LINEAR_PROJECT_ID") // TODO: Add to .env
  }
};


