import 'dotenv/config';
import { z } from 'zod';

const numFromString = (def?: number) =>
  z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return def;
      if (typeof v === 'number') return v;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }, z.number())
    .optional();

const required = z.string().min(1);
const optStr = z.string().optional().default('');

const EnvSchema = z.object({
  POLYMARKET_API_KEY: optStr,
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_WS_URL: z
    .string()
    .url()
    .default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),

  PHANTOM_PRIVATE_KEY: optStr,
  POLYGON_RPC_URL: z.string().url().default('https://polygon-rpc.com'),
  POLYGON_CHAIN_ID: numFromString(137),

  MAX_POSITION_USDC: numFromString(500),
  KELLY_FRACTION: numFromString(0.25),
  MIN_EDGE_THRESHOLD: numFromString(0.03),
  MAX_OPEN_POSITIONS: numFromString(10),
  DAILY_LOSS_LIMIT_USDC: numFromString(200),
  PROFIT_TARGET_PCT: numFromString(0.15),
  STOP_LOSS_PCT: numFromString(0.08),
  MAX_DRAWDOWN_PCT: numFromString(0.2),

  TELEGRAM_BOT_TOKEN: optStr,
  TELEGRAM_CHAT_ID: optStr,
  API_SERVER_PORT: numFromString(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  METACULUS_API_URL: z.string().url().default('https://www.metaculus.com/api2'),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const errs = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errs}`);
  }
  return parsed.data;
}

export const config = parseEnv();

export function assertTradingReady(c: Env = config): void {
  const missing: string[] = [];
  if (!c.PHANTOM_PRIVATE_KEY) missing.push('PHANTOM_PRIVATE_KEY');
  if (missing.length) {
    throw new Error(
      `Cannot trade live: missing required env vars: ${missing.join(', ')}`,
    );
  }
}
