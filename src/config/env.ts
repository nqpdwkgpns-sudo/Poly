import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  POLYMARKET_API_KEY: z.string().optional().default(''),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_WS_URL: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  PHANTOM_PRIVATE_KEY: z.string().optional().default(''),
  POLYGON_RPC_URL: z.string().url().default('https://polygon-rpc.com'),
  PAPER_TRADING: z.coerce.boolean().default(true),
  MAX_POSITION_USDC: z.coerce.number().positive().default(500),
  KELLY_FRACTION: z.coerce.number().min(0).max(1).default(0.25),
  MIN_EDGE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.03),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(10),
  DAILY_LOSS_LIMIT_USDC: z.coerce.number().positive().default(200),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATA_DIR: z.string().default('./data')
});

export type AppConfig = z.infer<typeof envSchema>;
export const config: AppConfig = envSchema.parse(process.env);
