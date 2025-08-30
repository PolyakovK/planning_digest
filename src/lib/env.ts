type RequiredEnv =
  | "NOTION_TOKEN"
  | "MEETINGS_ROOT_PAGE_ID"
  | "FORECASTS_ROOT_PAGE_ID"
  | "DIGESTS_ROOT_PAGE_ID"
  | "OPENAI_API_KEY"
  | "WEEKLY_PLANNING_ROOT_PAGE_ID"
  | "LINEAR_API_KEY"
  | "LINEAR_TEAM_IDS"
  | "LINEAR_REVENUE_TEAM_ID"
  | "LINEAR_PROJECT_DOCUMENTS_ID";

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
    weeklyPlanningPageId: () => getEnv("WEEKLY_PLANNING_ROOT_PAGE_ID"), // TODO: Add to .env
    allMeetingsPageId: () => getEnv("MEETINGS_ROOT_PAGE_ID"), // TODO: Add to .env
    forecastsPageId: () => getEnv("FORECASTS_ROOT_PAGE_ID") // TODO: Add to .env
  },
  digest: {
    targetPageId: () => getEnv("DIGESTS_ROOT_PAGE_ID"), // TODO: Add to .env
    timezone: () => process.env.DIGEST_TIMEZONE || "Europe/Moscow"
  },
  openai: {
    apiKey: () => getEnv("OPENAI_API_KEY"), // TODO: Add to .env
    model: () => process.env.OPENAI_MODEL || "gpt-5-mini"
  },
  linear: {
    apiKey: () => getEnv("LINEAR_API_KEY"),
    teamIds: () => getEnv("LINEAR_TEAM_IDS"),
    revenueTeamId: () => getEnv("LINEAR_REVENUE_TEAM_ID"),
    documentsProjectId: () => getEnv("LINEAR_PROJECT_DOCUMENTS_ID")
  }
};


