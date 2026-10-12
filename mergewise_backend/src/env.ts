import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().url().optional(),

  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

  GITHUB_OAUTH_CLIENT_ID: z.string().min(1, "GITHUB_OAUTH_CLIENT_ID is required"),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1, "GITHUB_OAUTH_CLIENT_SECRET is required"),

  GITHUB_APP_SLUG: z.string().min(1, "GITHUB_APP_SLUG is required"),
  GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1, "GITHUB_APP_PRIVATE_KEY is required"),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),

  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EMBEDDING_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),

  LLM_API_KEY: z.string().optional(),
  LLM_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL_SMALL: z.string().min(1).default("gpt-4o-mini"),
  LLM_MODEL_STRONG: z.string().min(1).default("gpt-4o"),

  // Invitation emails go out through Resend when both are set; without
  // them, admins get the invite link to copy and share themselves.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  API_BASE_URL: z.string().url().default("http://localhost:3000"),
  WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
