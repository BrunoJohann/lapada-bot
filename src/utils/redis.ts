import Redis from "ioredis";
import { logger } from "./logger";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;

  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    redis.on("error", (err) => logger.error("Redis error:", err));
    redis.on("connect", () => logger.info("Redis connected"));
  }

  return redis;
}

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const client = getRedis();

  if (client) {
    try {
      const cached = await client.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      // se Redis falhar, continua sem cache
    }
  }

  const data = await fetcher();

  if (client) {
    try {
      await client.set(key, JSON.stringify(data), "EX", ttlSeconds);
    } catch {
      // silencia erro de cache
    }
  }

  return data;
}

export async function invalidateCache(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(...keys);
  } catch {
    // silencia
  }
}
