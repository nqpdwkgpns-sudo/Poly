import axios from "axios";
import axiosRetry from "axios-retry";

export const buildHttpClient = (baseURL: string, timeoutMs = 10_000) => {
  const client = axios.create({
    baseURL,
    timeout: timeoutMs
  });

  axiosRetry(client, {
    retries: 4,
    shouldResetTimeout: true,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkError(error) ||
      axiosRetry.isRetryableError(error) ||
      error.response?.status === 429
  });

  return client;
};
