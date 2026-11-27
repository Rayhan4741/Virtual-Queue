import os from 'os';
import { getIO } from './socketService.js';

interface MetricsState {
  totalRequests: number;
  totalErrors: number;
  totalLatencyMs: number;
  failedTokenRequests: number;
  paymentFailures: number;
  cronFailures: number;
}

const state: MetricsState = {
  totalRequests: 0,
  totalErrors: 0,
  totalLatencyMs: 0,
  failedTokenRequests: 0,
  paymentFailures: 0,
  cronFailures: 0,
};

export const metrics = {
  recordRequest(durationMs: number, statusCode: number) {
    state.totalRequests += 1;
    state.totalLatencyMs += durationMs;
    if (statusCode >= 500) state.totalErrors += 1;
  },
  recordTokenFailure() {
    state.failedTokenRequests += 1;
  },
  recordPaymentFailure() {
    state.paymentFailures += 1;
  },
  recordCronFailure() {
    state.cronFailures += 1;
  },
  getSnapshot() {
    const io = getIO();
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.round(process.uptime()),
      totalRequests: state.totalRequests,
      errorRatePercent:
        state.totalRequests > 0 ? Number(((state.totalErrors / state.totalRequests) * 100).toFixed(2)) : 0,
      avgResponseTimeMs:
        state.totalRequests > 0 ? Number((state.totalLatencyMs / state.totalRequests).toFixed(2)) : 0,
      failedTokenRequests: state.failedTokenRequests,
      paymentFailures: state.paymentFailures,
      cronFailures: state.cronFailures,
      socketConnections: io ? io.engine.clientsCount : 0,
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
      cpuLoadAvg: os.loadavg().map((v) => Number(v.toFixed(2))),
    };
  },
};
