import { test } from '@playwright/test';
import type { TimePeriod } from '../pages/ron-modal-form-controls';
import type { RonApiClient } from '../utils/ron-api-client';
import { consecutiveWorkingDays, type IsoDate } from '../utils/working-days';

/** Helper dung chung cho spec tao don (Nghi phep / Remote / OT). */

/** `count` ngay LV lien tiep tu `start`, moi ngay ca ngay. */
export function allDays(start: IsoDate, count: number): TimePeriod[] {
  return consecutiveWorkingDays(start, count).map((day) => ({ day, allDay: true as const }));
}

/**
 * Skip test neu ngay muon dung da co don hieu luc (moi loai) cua account test
 * -> tranh REGISTERED_OVERLAP_ERROR va khong dung den du lieu that.
 */
export async function skipIfOccupied(api: RonApiClient, periods: TimePeriod[]) {
  const days = periods.map((p) => p.day).sort();
  const occupied = await api.occupiedDays(days[0], days[days.length - 1]);
  const clash = days.filter((d) => occupied.has(d));
  test.skip(clash.length > 0, `Account test da co don hieu luc ngay ${clash.join(', ')}`);
}
