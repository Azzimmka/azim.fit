import { describe, expect, it } from 'vitest';
import {
  buildReminderJobs,
  getReminderKey,
  getReminderTimestamp,
  pruneDeliveredReminderKeys,
  selectDueReminders,
} from './reminders.js';

function workout(overrides = {}) {
  return {
    id: 'w1',
    title: 'Силовая',
    status: 'planned',
    plannedDate: '2026-07-13',
    time: '10:00',
    reminder: 15,
    ...overrides,
  };
}

describe('reminders', () => {
  it.each([
    [0, 0],
    [5, 5],
    [15, 15],
    [30, 30],
    [60, 60],
  ])('applies the %s minute offset', (offset, expectedMinutes) => {
    const item = workout({ reminder: offset });
    const start = new Date(2026, 6, 13, 10, 0).getTime();
    expect(getReminderTimestamp(item)).toBe(start - expectedMinutes * 60_000);
  });

  it('deduplicates delivered jobs and changes identity after reschedule', () => {
    const item = workout();
    const key = getReminderKey(item);
    const now = new Date(2026, 6, 13, 10, 0);
    expect(selectDueReminders([item], { now, deliveredKeys: [] })).toHaveLength(1);
    expect(selectDueReminders([item], { now, deliveredKeys: [key] })).toHaveLength(0);
    expect(getReminderKey(workout({ plannedDate: '2026-07-14' }))).not.toBe(key);
  });

  it('cancels jobs and ledger entries after complete, skip, or delete', () => {
    const item = workout();
    const key = getReminderKey(item);
    expect(buildReminderJobs([{ ...item, status: 'completed' }])).toEqual([]);
    expect(buildReminderJobs([{ ...item, status: 'skipped' }])).toEqual([]);
    expect(pruneDeliveredReminderKeys([key], [])).toEqual([]);
  });
});

