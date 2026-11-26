import { Router } from 'express';
import { getDbHealth } from '../config/db.js';
import { isRedisAvailable } from '../config/redis.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDbHealth();
  const redis = isRedisAvailable();
  const statusCode = db.connected ? 200 : 503;
  res.status(statusCode).json({
    status: db.connected ? 'ok' : 'degraded',
    instanceId: env.INSTANCE_ID,
    uptimeSec: Math.round(process.uptime()),
    database: db,
    redis: { connected: redis, mode: redis ? 'redis' : 'mongodb-fallback' },
    timestamp: new Date().toISOString(),
  });
});

export default router;
