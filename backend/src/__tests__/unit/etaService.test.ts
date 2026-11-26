import { describe, it, expect } from 'vitest';
import { computeEtaSeconds, evaluateEtaMape } from '../../services/etaService.js';

describe('Waiting Time Estimation Engine', () => {
  it('returns meaningful null estimates for paused services or zero active counters', () => {
    expect(
      computeEtaSeconds({ peopleAhead: 0, activeCounters: 2, emaServiceTimeSec: 300, serviceAvailable: true }).waitSeconds
    ).toBe(0);

    const noCounter = computeEtaSeconds({ peopleAhead: 3, activeCounters: 0, emaServiceTimeSec: 300, serviceAvailable: true });
    expect(noCounter.waitSeconds).toBeNull();
    expect(noCounter.statusLabel).toBe('Counter temporarily unavailable');

    const paused = computeEtaSeconds({ peopleAhead: 5, activeCounters: 2, emaServiceTimeSec: 300, serviceAvailable: false });
    expect(paused.waitSeconds).toBeNull();
    expect(paused.statusLabel).toBe('Service paused');
  });

  it('achieves <= 25% MAPE on a realistic simulated queue dataset', () => {
    const dataset = [
      { peopleAhead: 2, activeCounters: 2, emaServiceTimeSec: 300, actualWaitSec: 320 },
      { peopleAhead: 4, activeCounters: 2, emaServiceTimeSec: 300, actualWaitSec: 580 },
      { peopleAhead: 6, activeCounters: 3, emaServiceTimeSec: 240, actualWaitSec: 510 },
      { peopleAhead: 3, activeCounters: 1, emaServiceTimeSec: 200, actualWaitSec: 550 },
      { peopleAhead: 8, activeCounters: 2, emaServiceTimeSec: 300, actualWaitSec: 1150 },
    ];
    const { mapePercent, evaluatedCount } = evaluateEtaMape(dataset);
    expect(evaluatedCount).toBe(5);
    expect(mapePercent).toBeLessThanOrEqual(25);
  });
});
