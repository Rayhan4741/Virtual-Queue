import { describe, it, expect } from 'vitest';
import { computeEffectivePriority, sortEligibleQueue } from '../../services/tokenEngine.js';
import type { IToken } from '../../models/Token.js';
import type { IService } from '../../models/Service.js';

describe('Queue Ordering & Anti-Starvation Priority Aging', () => {
  it('increases effective priority with wait time and caps at maxPriorityLevel', () => {
    const now = new Date('2026-01-01T10:45:00Z');
    const createdAt = new Date('2026-01-01T10:00:00Z'); // 45 minutes waited

    const eff = computeEffectivePriority({
      basePriority: 0,
      createdAt,
      now,
      agingEnabled: true,
      agingMinutes: 15,
      maxPriorityLevel: 3,
    });
    expect(eff).toBe(3);
  });

  it('prevents priority starvation by promoting long-waiting standard tokens', () => {
    const now = new Date('2026-01-01T11:00:00Z');
    const oldStandard = {
      tokenNumber: 'A-101',
      priority: 0,
      createdAt: new Date('2026-01-01T10:00:00Z'), // 60m wait -> eff 3
      queueOrderScore: 1000,
      sequenceNumber: 1,
    } as unknown as IToken;

    const freshPriority = {
      tokenNumber: 'A-102',
      priority: 2,
      createdAt: new Date('2026-01-01T10:58:00Z'), // 2m wait -> eff 2
      queueOrderScore: 2000,
      sequenceNumber: 2,
    } as unknown as IToken;

    const svc = {
      priorityPolicy: { enabled: true, agingMinutes: 15, maxPriorityLevel: 3 },
    } as unknown as IService;

    const sorted = sortEligibleQueue([freshPriority, oldStandard], svc, now);
    expect(sorted[0].tokenNumber).toBe('A-101');
  });
});
