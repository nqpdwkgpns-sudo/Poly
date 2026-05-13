import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { child } from '../monitoring/logger.js';

const log = child('http');

export function createHttpClient(baseURL: string, opts: AxiosRequestConfig = {}): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 15_000,
    headers: { Accept: 'application/json', 'User-Agent': 'polymarket-alpha-bot/0.1' },
    ...opts,
  });

  axiosRetry(instance, {
    retries: 4,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) => {
      if (axiosRetry.isNetworkOrIdempotentRequestError(err)) return true;
      const status = err.response?.status;
      return status !== undefined && (status === 429 || status >= 500);
    },
    onRetry: (count, err, cfg) => {
      log.warn(
        {
          attempt: count,
          url: cfg.url,
          status: err.response?.status,
          message: err.message,
        },
        'http retry',
      );
    },
  });

  return instance;
}
