import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envInput: NodeJS.ProcessEnv = { ...process.env };
if (envInput.VITEST && !envInput.PHANTOM_PRIVATE_KEY) {
  envInput.PHANTOM_PRIVATE_KEY = "test-private-key";
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_CLOB_URL: z.string().url().default("https://clob.polymarket.com"),
  POLYMARKET_GAMMA_URL: z.string().url().default("https://gamma-api.polymarket.com"),
  PHANTOM_PRIVATE_KEY: z.string().min(1, "PHANTOM_PRIVATE_KEY is required"),
  POLYGON_RPC_URL: z.string().url().default("https://polygon-rpc.com"),
  MAX_POSITION_USDC: z.coerce.number().positive().default(500),
  KELLY_FRACTION: z.coerce.number().min(0).max(1).default(0.25),
  MIN_EDGE_THRESHOLD: z.coerce.number().min(0).default(0.03),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(10),
  DAILY_LOSS_LIMIT_USDC: z.coerce.number().positive().default(200),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

const parsed = envSchema.safeParse(envInput);

if (!parsed.success) {
  const issues = "issues" in parsed.error ? parsed.error.issues : [];
  const details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const config = parsed.data;

export type AppConfig = typeof config;
