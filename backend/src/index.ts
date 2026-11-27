import http from 'http';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initRedis, closeRedis } from './config/redis.js';
import { createApp } from './app.js';
import { initSocketServer } from './services/socketService.js';
import { startCronJobs, stopCronJobs } from './services/cronService.js';
import { recoverQueueStateOnStartup } from './services/tokenEngine.js';
import { seedIfEmpty } from './seed.js';

async function main() {
  await connectDB();
  await initRedis();
  await seedIfEmpty();
  const recovery = await recoverQueueStateOnStartup();
  console.log('[Recovery] Startup queue reconciliation:', recovery);

  const app = createApp();
  const server = http.createServer(app);
  await initSocketServer(server);
  startCronJobs();

  server.listen(env.PORT, () => {
    console.log(`[Server] Virtual Queue (${env.INSTANCE_ID}) listening on port ${env.PORT}`);
  });

  // Graceful connection draining on SIGTERM / SIGINT (for Load Balancer zero-downtime restarts)
  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Draining connections...`);
    stopCronJobs();
    server.close(async () => {
      await closeRedis();
      await disconnectDB();
      console.log('[Server] Shutdown complete.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
