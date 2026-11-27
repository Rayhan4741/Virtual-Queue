import { Router } from 'express';
import { getDbHealth } from '../config/db.js';
import { isRedisAvailable } from '../config/redis.js';

const router = Router();

/**
 * Public minimal liveness/readiness endpoint for load balancers.
 * Detailed operational metrics are exposed only on authenticated /api/admin/system-status.
 */
router.get('/', (_req, res) => {
  const db = getDbHealth();
  const redis = isRedisAvailable();
  const statusCode = db.connected ? 200 : 503;
  res.status(statusCode).json({
    status: db.connected ? 'ok' : 'degraded',
    database: { connected: db.connected },
    redis: { connected: redis },
    timestamp: new Date().toISOString(),
  });
});

export default router;
