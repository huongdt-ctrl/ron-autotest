import { expect, test, type Page } from '@playwright/test';
import { AUTOMATION_REASON_PREFIX } from './employee-session-fixture';
import { CheckInRegisterFormPage } from '../pages/check-in-register-form-page';
import { LeaveRequestFormPage } from '../pages/leave-request-form-page';
import type { TimePeriod } from '../pages/ron-modal-form-controls';
import type { CheckInRegister, RonApiClient } from '../utils/ron-api-client';
import { addWorkingDays, consecutiveWorkingDays, monthRange, todayInVietnam, type IsoDate } from '../utils/working-days';

/** Helper dung chung cho spec tao don (Nghi phep / Remote / OT / Cham cong). */

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

export interface CreatedLeave {
  id: number;
  day: IsoDate;
  reason: string;
}

/**
 * Tao qua UI (form 05) 1 don nghi khong huong luong ca ngay (khong tru quy phep), cach hom nay
 * 10 ngay LV (du bao truoc QD 2.15). Ngay da co don hieu luc -> skip. Li do AUTOTEST_ kem timestamp
 * la duy nhat (don Huy cua lan chay truoc cung ngay, cung case se trung li do).
 */
export async function createPendingLeave(page: Page, api: RonApiClient, approver: string, tag: string): Promise<CreatedLeave> {
  const periods = allDays(addWorkingDays(todayInVietnam(), 10), 1);
  await skipIfOccupied(api, periods);
  const reason = `${AUTOMATION_REASON_PREFIX}${tag} ${Date.now()}`;
  const form = new LeaveRequestFormPage(page);
  await form.open();
  await form.fill({ periods, approver, reason });
  const result = await form.submit();
  await form.close();
  expect(result.errorCode, JSON.stringify(result)).toBeNull();
  expect(result.createdId, 'Tao don test that bai').not.toBeNull();
  return { id: result.createdId!, day: periods[0].day, reason };
}

/** QD-04-02 muc 1.7: toi da 5 don cham cong / thang; moi don tru don Huy deu tinh. */
export const CHECK_IN_MONTHLY_LIMIT = 5;

export const isCountedCheckIn = (r: CheckInRegister) => r.approvalStatus !== 'CANCELED';

/** Don cham cong trong thang chua `day`, kem so don tinh vao han muc. */
export async function checkInMonthState(api: RonApiClient, day: IsoDate) {
  const [from, to] = monthRange(day);
  const requests = await api.listMyCheckInRegisters(from, to);
  return { requests, counted: requests.filter(isCountedCheckIn).length };
}

/** Ngay da qua trong thang hien tai chua co don cham cong nao (tru Huy), moi nhat truoc. */
export function freePastCheckInDays(requests: CheckInRegister[]): IsoDate[] {
  const today = todayInVietnam();
  const used = new Set(requests.filter(isCountedCheckIn).map((r) => r.day));
  const days: IsoDate[] = [];
  for (let d = Number(today.slice(8, 10)) - 1; d >= 1; d--) {
    const day = `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
    if (!used.has(day)) days.push(day);
  }
  return days;
}

/**
 * Tao qua UI (form 10) 1 don cham cong van phong 08:00-12:00 kem anh, ngay da qua gan nhat con trong
 * trong thang. Het ngay / het han muc -> skip. API tao tra id = null -> lay don qua API danh sach
 * theo li do AUTOTEST_ (kem timestamp, duy nhat). Don dep: fixture checkInCleanup.
 */
export async function createPendingCheckIn(page: Page, api: RonApiClient, approver: string, tag: string): Promise<CheckInRegister> {
  const { requests, counted } = await checkInMonthState(api, todayInVietnam());
  const [day] = freePastCheckInDays(requests);
  test.skip(!day || counted >= CHECK_IN_MONTHLY_LIMIT, `Khong con ngay trong / han muc don cham cong thang (da dung ${counted})`);
  const reason = `${AUTOMATION_REASON_PREFIX}${tag} ${Date.now()}`;
  const form = new CheckInRegisterFormPage(page);
  await form.open();
  await form.fill({ approver, day, checkIn: '08:00', checkOut: '12:00', reason });
  const result = await form.submit();
  await form.close();
  expect(result.errorCode, JSON.stringify(result)).toBeNull();
  const created = (await api.listMyCheckInRegisters(day, day)).find((r) => r.reason === reason);
  expect(created, 'Tao don cham cong test that bai').toBeDefined();
  return created!;
}
