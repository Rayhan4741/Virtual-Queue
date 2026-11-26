import { Redis } from 'ioredis';
import { env } from './env.js';

let redisClient: Redis | null = null;
let redisAvailable = false;

export async function initRedis(): Promise<Redis | null> {
  if (!env.REDIS_URL) {
    console.log('[Redis] No REDIS_URL configured; using MongoDB atomic-counter fallback.');
    redisAvailable = false;
    return null;
  }

  try {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });

    client.on('ready', () => {
      redisAvailable = true;
      console.log(`[Redis] Connected (${env.INSTANCE_ID})`);
    });

    client.on('error', (err) => {
      if (redisAvailable) {
        console.warn('[Redis] Connection lost, falling back to MongoDB:', err.message);
      }
      redisAvailable = false;
    });

    await client.connect();
    await client.ping();
    redisClient = client;
    redisAvailable = true;
    return client;
  } catch (err) {
    console.warn('[Redis] Unavailable, using MongoDB atomic-counter fallback:', (err as Error).message);
    redisAvailable = false;
    redisClient = null;
    return null;
  }
}

export function getRedisClient(): Redis | null {
  return redisAvailable ? redisClient : null;
}

export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient !== null;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
    redisAvailable = false;
  }
}
