import type { Locator, Page } from '@playwright/test';
import { monthDiff, todayInVietnam, type IsoDate } from '../utils/working-days';

/**
 * Thao tac dung chung cho cac modal tao don cua RON (CSS module _modalContainer_/_accept_,
 * react-select, react-datepicker, popup xac nhan "Chu y").
 */

/** Khoang thoi gian cua don Nghi phep / Remote: ca ngay (08:00-17:00) hoac gio cu the. */
export type TimePeriod = { day: IsoDate; allDay: true } | { day: IsoDate; from: string; to: string };

export interface ModalSubmitResult {
  /** HTTP status cua request tao don; null neu client chan, request khong duoc gui. */
  httpStatus: number | null;
  /** errorCode server tra trong body (loi nghiep vu tra HTTP 200). */
  errorCode: string | null;
  /** body.data cua response (null neu khong co response). */
  data: { id?: number | null } | null;
  toasts: string[];
}

/** Modal tao don theo tieu de. */
export function ronModal(page: Page, title: string): Locator {
  return page.locator('[class*="_modalContainer_"]').filter({ hasText: title });
}

/** Bam nut huy (nut _btn_ khong phai _accept_) neu modal dang mo. */
export async function closeRonModal(modal: Locator) {
  if (await modal.isVisible()) await modal.locator('[class*="_btn_"]:not([class*="_accept_"])').last().click();
}

export async function selectReactOption(page: Page, modal: Locator, comboIndex: number, label: string) {
  const combo = modal.locator('input[role="combobox"]').nth(comboIndex);
  await combo.focus();
  await page.keyboard.press('ArrowDown');
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.locator('[role="option"], [id*="-option-"]').filter({ hasText: new RegExp(`^${escaped}$`) }).first().click();
}

/** Datepicker mo o thang hien tai -> bam chuyen thang roi chon ngay. */
export async function pickDatepickerDay(page: Page, input: Locator, day: IsoDate) {
  await input.click();
  const diff = monthDiff(todayInVietnam(), day);
  const nav = page.locator(`.react-datepicker__navigation--${diff > 0 ? 'next' : 'previous'}`);
  for (let i = 0; i < Math.abs(diff); i++) await nav.click();
  const dayOfMonth = String(Number(day.slice(8, 10)));
  await page
    .locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)')
    .filter({ hasText: new RegExp(`^${dayOfMonth}$`) })
    .first()
    .click();
}

export async function pickDatepickerTimes(page: Page, modal: Locator, periodIndex: number, from: string, to: string) {
  for (const [placeholder, value] of [['Chọn thời gian bắt đầu', from], ['Chọn thời gian kết thúc', to]] as const) {
    await modal.locator(`input[placeholder="${placeholder}"]`).nth(periodIndex).click();
    await page.locator('.react-datepicker__time-list-item').filter({ hasText: new RegExp(`^${value}$`) }).first().click();
    // Bam lai dung gio dang chon (vd gio ket thuc mac dinh 17:00) khong phat onChange -> popup
    // khong tu dong, chiem focus ban phim lam react-select ke tiep khong mo menu. Bam ra goc modal de dong.
    const popup = page.locator('.react-datepicker__time-list');
    if (await popup.isVisible()) await modal.click({ position: { x: 5, y: 5 } });
    await popup.waitFor({ state: 'hidden' });
  }
}

const MAX_PERIODS = 10; // form an nut "Them khoang thoi gian" khi da co 10 khoang

/** Dien cac khoang thoi gian (form mo san 1 khoang; them khoang bang nut "Them khoang thoi gian"). */
export async function fillTimePeriods(page: Page, modal: Locator, periods: TimePeriod[]) {
  if (periods.length > MAX_PERIODS) throw new Error(`Form chi cho toi da ${MAX_PERIODS} khoang thoi gian`);
  const addButton = modal.getByRole('button', { name: 'Thêm khoảng thời gian' });
  for (let i = 1; i < periods.length; i++) await addButton.click();
  for (const [index, period] of periods.entries()) {
    await pickDatepickerDay(page, modal.locator('input[placeholder="Chọn ngày"]').nth(index), period.day);
    // Switch "Ca ngay" la checkbox an -> bam vao phan tu cha
    if ('allDay' in period) await modal.locator('input[type="checkbox"]').nth(index).locator('xpath=..').click();
    else await pickDatepickerTimes(page, modal, index, period.from, period.to);
  }
}

/** Bam ✓, xac nhan popup "Chu y"; doc toast va response cua POST `postUrl` neu request duoc gui. */
export async function submitRonModal(page: Page, modal: Locator, postUrl: RegExp): Promise<ModalSubmitResult> {
  const responsePromise = page
    .waitForResponse((r) => r.request().method() === 'POST' && postUrl.test(new URL(r.url()).pathname), { timeout: 8_000 })
    .catch(() => null);
  await modal.locator('[class*="_accept_"]').last().click();
  const confirmPopup = page.locator('[class*="_modal_"]').filter({ hasText: 'Chú ý' }).last();
  await confirmPopup.locator('[class*="_accept_"]').first().click();
  // Toast tu tat sau vai giay -> doc ngay khi xuat hien, roi moi lay response (co the khong co).
  // Loai vung aria-live cua react-datepicker ("Selected time: 10:00") cung co role=alert.
  const toastLocator = page
    .locator('[class*="toast" i], [role="alert"]')
    .filter({ visible: true })
    .filter({ hasNotText: /^Selected (time|date)/ });
  await toastLocator.first().waitFor({ timeout: 8_000 }).catch(() => {});
  const toasts = [...new Set((await toastLocator.allInnerTexts()).map((t) => t.trim()).filter(Boolean))];
  const response = await responsePromise;
  const body = response ? await response.json().catch(() => null) : null;
  return {
    httpStatus: response?.status() ?? null,
    errorCode: body?.error?.errorCode ?? null,
    data: body?.data ?? null,
    toasts,
  };
}
