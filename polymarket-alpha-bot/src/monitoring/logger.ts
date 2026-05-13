import pino, { Logger, LoggerOptions } from 'pino';
import { config } from '../config/env.js';

const isDev = config.NODE_ENV !== 'production';

const baseOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: { service: 'polymarket-alpha-bot' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'PHANTOM_PRIVATE_KEY',
      'privateKey',
      'signature',
      '*.privateKey',
      '*.signature',
    ],
    censor: '[REDACTED]',
  },
};

export const logger: Logger = isDev
  ? pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service',
        },
      },
    })
  : pino(baseOptions);

export function child(component: string, extra: Record<string, unknown> = {}): Logger {
  return logger.child({ component, ...extra });
}
