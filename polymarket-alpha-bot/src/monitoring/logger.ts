import pino from "pino";
import { config } from "../config/env.js";

const prettyTransport = config.NODE_ENV === "development"
  ? {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" }
    }
  : undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: prettyTransport,
  base: {
    service: "polymarket-alpha-bot",
    env: config.NODE_ENV
  }
});
