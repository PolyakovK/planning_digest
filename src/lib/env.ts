type RequiredEnv =
  | "NOTION_TOKEN"
  | "DIGESTS_ROOT_PAGE_ID"
  | "LINEAR_API_KEY"
  | "OPENAI_API_KEY";

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
  },
  digest: {
    targetPageId: () => getEnv("DIGESTS_ROOT_PAGE_ID"), // TODO: Add to .env
    timezone: () => process.env.DIGEST_TIMEZONE || "Europe/Moscow"
  },
  linear: {
    apiKey: () => getEnv("LINEAR_API_KEY"), // TODO: Add to .env
  },
  openai: {
    apiKey: () => getEnv("OPENAI_API_KEY"), // TODO: Add to .env
  }
};


