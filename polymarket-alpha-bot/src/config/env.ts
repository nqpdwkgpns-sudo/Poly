import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Polymarket
  POLYMARKET_API_KEY: z.string().optional().default(''),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),

  // Wallet
  PHANTOM_PRIVATE_KEY: z.string().min(1, 'PHANTOM_PRIVATE_KEY is required'),
  POLYGON_RPC_URL: z.string().url().default('https://polygon-rpc.com'),

  // Strategy
  MAX_POSITION_USDC: z.coerce.number().positive().default(500),
  KELLY_FRACTION: z.coerce.number().min(0).max(1).default(0.25),
  MIN_EDGE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.03),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(10),
  DAILY_LOSS_LIMIT_USDC: z.coerce.number().positive().default(200),

  // Monitoring
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),

  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3001),
});

export type Config = z.infer<typeof envSchema>;

function validateEnv(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment validation failed:');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export const config: Config = validateEnv();
