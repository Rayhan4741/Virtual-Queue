import { getTodayDateString } from './tokenEngine.js';

export interface ScheduleCheckInput {
  timezone: string;
  workingHours: {
    open: string;
    close: string;
    days: string[];
  };
  holidays?: string[];
  enforceWorkingHours?: boolean;
}

export function getLocalTimeParts(timeZone: string, now = new Date()): {
  dateStr: string;
  weekday: string;
  hhmm: string;
} {
  const dateStr = getTodayDateString(timeZone, now);
  try {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    return { dateStr, weekday, hhmm: `${hour === '24' ? '00' : hour}:${minute}` };
  } catch {
    return {
      dateStr,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()],
      hhmm: now.toISOString().slice(11, 16),
    };
  }
}

export function checkOrganizationSchedule(
  org: ScheduleCheckInput,
  now = new Date()
): { open: boolean; reason?: string; localTime: string; localDate: string } {
  const tz = org.timezone || 'Asia/Dhaka';
  const { dateStr, weekday, hhmm } = getLocalTimeParts(tz, now);

  if (org.holidays?.includes(dateStr)) {
    return {
      open: false,
      reason: `Organization is closed today (${dateStr}) for a scheduled holiday.`,
      localTime: hhmm,
      localDate: dateStr,
    };
  }

  if (org.enforceWorkingHours) {
    if (org.workingHours.days?.length > 0 && !org.workingHours.days.includes(weekday)) {
      return {
        open: false,
        reason: `Organization is closed on ${weekday}.`,
        localTime: hhmm,
        localDate: dateStr,
      };
    }

    const open = org.workingHours.open || '09:00';
    const close = org.workingHours.close || '17:00';
    if (hhmm < open || hhmm >= close) {
      return {
        open: false,
        reason: `Outside operating hours (${open}–${close} ${tz}). Current local time: ${hhmm}.`,
        localTime: hhmm,
        localDate: dateStr,
      };
    }
  }

  return { open: true, localTime: hhmm, localDate: dateStr };
}
