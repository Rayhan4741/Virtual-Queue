import cron from 'node-cron';
import { processExpiredCalledTokens } from './tokenEngine.js';
import { emitQueueEvent } from './socketService.js';
import { sendNotification } from './notificationService.js';

let task: cron.ScheduledTask | null = null;

export function startCronJobs(): void {
  if (task) return;
  // Every minute: check for CALLED tokens with 2 recalls & >3 min grace period
  task = cron.schedule('* * * * *', async () => {
    try {
      const noShows = await processExpiredCalledTokens(3);
      for (const token of noShows) {
        const rooms = [
          `organization:${token.organizationId.toString()}`,
          `service:${token.serviceId.toString()}`,
        ];
        if (token.userId) rooms.push(`user:${token.userId.toString()}`);

        emitQueueEvent('token:updated', rooms, {
          tokenId: token._id,
          tokenNumber: token.tokenNumber,
          status: 'NO_SHOW',
        });

        if (token.userId) {
          await sendNotification({
            userId: token.userId.toString(),
            tokenId: token._id.toString(),
            organizationId: token.organizationId.toString(),
            type: 'NO_SHOW',
            title: `Token ${token.tokenNumber} marked No-Show`,
            message: 'You missed your call after 2 recalls and a 3-minute grace period. You may use one Late Pass if eligible.',
            dedupeKey: `noshow:${token._id.toString()}`,
          });
        }
      }
    } catch (err) {
      console.warn('[Cron] No-show processor error:', (err as Error).message);
    }
  });
}

export function stopCronJobs(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
