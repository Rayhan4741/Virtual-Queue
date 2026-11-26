import { Service } from '../models/Service.js';
import { Counter } from '../models/Counter.js';
import { Token } from '../models/Token.js';

const EMA_ALPHA = 0.25;

/**
 * Updates Exponential Moving Average (EMA) of service duration when a token completes.
 */
export async function updateEmaServiceTime(serviceId: string, observedDurationSec: number): Promise<number> {
  const clamped = Math.max(30, Math.min(7200, observedDurationSec));
  const service = await Service.findById(serviceId);
  if (!service) return clamped;

  const currentEma = service.emaServiceTimeSec || service.avgServiceTimeSec || 300;
  const nextEma = Math.round(EMA_ALPHA * clamped + (1 - EMA_ALPHA) * currentEma);

  await Service.updateOne({ _id: serviceId }, { $set: { emaServiceTimeSec: nextEma } });
  return nextEma;
}

export interface EtaResult {
  estimatedWaitMinutes: number;
  estimatedWaitSeconds: number;
  peopleAhead: number;
  activeCounters: number;
  serviceAvailable: boolean;
  isApproximate: true;
  note: string;
}

/**
 * Pure ETA calculation function (also used in unit tests & MAPE evaluation).
 */
export function computeEtaSeconds(params: {
  peopleAhead: number;
  activeCounters: number;
  emaServiceTimeSec: number;
  serviceAvailable: boolean;
}): { waitSeconds: number; note: string } {
  const { peopleAhead, activeCounters, emaServiceTimeSec, serviceAvailable } = params;

  if (!serviceAvailable) {
    return { waitSeconds: 0, note: 'Service is currently paused or unavailable.' };
  }
  if (peopleAhead <= 0) {
    return { waitSeconds: 0, note: 'You are next in line. Approximate wait under 1 minute.' };
  }
  if (activeCounters <= 0) {
    // Fallback to single-counter estimate if no counter is currently active
    const fallbackSeconds = Math.max(0, Math.round(peopleAhead * emaServiceTimeSec));
    return {
      waitSeconds: fallbackSeconds,
      note: 'No active counters right now; estimate assumes 1 counter resumes.',
    };
  }

  const waitSeconds = Math.max(0, Math.round((peopleAhead * emaServiceTimeSec) / activeCounters));
  return {
    waitSeconds,
    note: 'Approximate wait time based on recent service durations and active counters.',
  };
}

/**
 * Computes live ETA for a given service or specific token.
 */
export async function getServiceEta(serviceId: string, queueOrderScoreBefore?: number): Promise<EtaResult> {
  const [service, activeCounters] = await Promise.all([
    Service.findById(serviceId).lean(),
    Counter.countDocuments({ assignedServices: serviceId, status: 'ACTIVE' }),
  ]);

  if (!service) {
    return {
      estimatedWaitMinutes: 0,
      estimatedWaitSeconds: 0,
      peopleAhead: 0,
      activeCounters: 0,
      serviceAvailable: false,
      isApproximate: true,
      note: 'Service not found.',
    };
  }

  const query: Record<string, unknown> = {
    serviceId,
    status: { $in: ['WAITING', 'CHECKED_IN'] },
  };
  if (typeof queueOrderScoreBefore === 'number') {
    query.queueOrderScore = { $lt: queueOrderScoreBefore };
  }

  const peopleAhead = await Token.countDocuments(query);
  const emaSec = service.emaServiceTimeSec || service.avgServiceTimeSec || 300;
  const { waitSeconds, note } = computeEtaSeconds({
    peopleAhead,
    activeCounters,
    emaServiceTimeSec: emaSec,
    serviceAvailable: service.isAvailable,
  });

  return {
    estimatedWaitMinutes: Math.ceil(waitSeconds / 60),
    estimatedWaitSeconds: waitSeconds,
    peopleAhead,
    activeCounters,
    serviceAvailable: service.isAvailable,
    isApproximate: true,
    note,
  };
}

/**
 * Evaluates Mean Absolute Percentage Error (MAPE) on a simulated dataset.
 * Safely excludes zero/near-zero actuals (< 30s) to avoid division blowup.
 */
export function evaluateEtaMape(
  samples: Array<{
    peopleAhead: number;
    activeCounters: number;
    emaServiceTimeSec: number;
    actualWaitSec: number;
  }>
): { mapePercent: number; evaluatedCount: number } {
  const valid = samples.filter((s) => s.actualWaitSec >= 30);
  if (valid.length === 0) return { mapePercent: 0, evaluatedCount: 0 };

  let totalPctError = 0;
  for (const s of valid) {
    const { waitSeconds } = computeEtaSeconds({
      peopleAhead: s.peopleAhead,
      activeCounters: s.activeCounters,
      emaServiceTimeSec: s.emaServiceTimeSec,
      serviceAvailable: true,
    });
    totalPctError += Math.abs(s.actualWaitSec - waitSeconds) / s.actualWaitSec;
  }

  return {
    mapePercent: Number(((totalPctError / valid.length) * 100).toFixed(2)),
    evaluatedCount: valid.length,
  };
}
