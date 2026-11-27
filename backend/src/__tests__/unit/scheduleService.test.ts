import { describe, it, expect } from 'vitest';
import { checkOrganizationSchedule } from '../../services/scheduleService.js';

describe('Working Hours, Holidays & Asia/Dhaka Schedule Enforcement', () => {
  const bank = {
    timezone: 'Asia/Dhaka',
    workingHours: { open: '10:00', close: '16:00', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] },
    holidays: ['2026-05-01'],
    enforceWorkingHours: true,
  };

  const hospital = {
    timezone: 'Asia/Dhaka',
    workingHours: { open: '08:00', close: '22:00', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    holidays: [],
    enforceWorkingHours: true,
  };

  it('allows bank booking during 10:00-16:00 Asia/Dhaka and blocks outside hours', () => {
    // 2026-05-03 is Sunday. 05:00Z = 11:00 Asia/Dhaka (open for both)
    const dhaka11am = new Date('2026-05-03T05:00:00.000Z');
    expect(checkOrganizationSchedule(bank, dhaka11am).open).toBe(true);
    expect(checkOrganizationSchedule(hospital, dhaka11am).open).toBe(true);

    // 14:00Z = 20:00 Asia/Dhaka (closed for bank, open for hospital)
    const dhaka8pm = new Date('2026-05-03T14:00:00.000Z');
    expect(checkOrganizationSchedule(bank, dhaka8pm).open).toBe(false);
    expect(checkOrganizationSchedule(hospital, dhaka8pm).open).toBe(true);
  });

  it('blocks booking on configured holidays and closed weekdays', () => {
    // 2026-05-01T05:00:00Z -> 11:00 Asia/Dhaka on 2026-05-01 (Holiday)
    const holiday = new Date('2026-05-01T05:00:00.000Z');
    const res = checkOrganizationSchedule(bank, holiday);
    expect(res.open).toBe(false);
    expect(res.reason).toContain('holiday');

    // 2026-05-02 is Saturday (closed for bank)
    const saturday = new Date('2026-05-02T05:00:00.000Z');
    expect(checkOrganizationSchedule(bank, saturday).open).toBe(false);
  });
});
