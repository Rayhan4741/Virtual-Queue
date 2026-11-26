import { describe, it, expect } from 'vitest';
import { getTodayDateString, getCurrentMonthString } from '../../services/tokenEngine.js';

describe('Organization Timezone Queue Date Rollover', () => {
  it('computes local YYYY-MM-DD in Asia/Dhaka across UTC midnight boundary', () => {
    // 2026-05-01T19:00:00Z is already 2026-05-02 01:00:00 AM in Asia/Dhaka (UTC+6)
    const utcMoment = new Date('2026-05-01T19:00:00.000Z');
    expect(getTodayDateString('UTC', utcMoment)).toBe('2026-05-01');
    expect(getTodayDateString('Asia/Dhaka', utcMoment)).toBe('2026-05-02');
    expect(getCurrentMonthString('Asia/Dhaka', utcMoment)).toBe('2026-05');
  });

  it('falls back safely to UTC ISO date if an invalid timezone string is passed', () => {
    const utcMoment = new Date('2026-05-01T19:00:00.000Z');
    expect(getTodayDateString('Invalid/Zone', utcMoment)).toBe('2026-05-01');
  });
});
