import { expect, type Locator, type Page } from '@playwright/test';
import type { IsoDate } from '../utils/working-days';

/**
 * Page Object cho man "Thoi gian cham cong" (/user-timekeeping-list) - doc 08. Man CHI DOC.
 * Bo loc Tu ngay / Den ngay (react-datepicker dd-MM-yyyy) dong bo voi query from/to tren URL.
 * Bang: Ngay ("<Thu>, dd-MM-yyyy") | Thoi gian checkin | Thoi gian checkout (HH:mm:ss), moi nhat truoc.
 */

export const TIMEKEEPING_PATH = '/user-timekeeping-list';
export const NO_DATA_TEXT = 'Không có dữ liệu';

const VN_WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** '2026-05-19' -> 'Thu Ba, 19-05-2026' (dinh dang cot Ngay). */
export function formatTimekeepingDay(day: IsoDate): string {
  const weekday = VN_WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  const [y, m, d] = day.split('-');
  return `${weekday}, ${d}-${m}-${y}`;
}

/** '2026-05-19' -> '19-05-2026' (dinh dang o datepicker). */
export function toDisplayDate(day: IsoDate): string {
  const [y, m, d] = day.split('-');
  return `${d}-${m}-${y}`;
}

export interface TimekeepingRow {
  day: string;
  checkIn: string;
  checkOut: string;
}

export class UserTimekeepingListPage {
  readonly page: Page;
  readonly fromInput: Locator;
  readonly toInput: Locator;
  readonly rows: Locator;
  readonly pageInfo: Locator;
  /** Pager: [ve trang dau, trang truoc, trang sau, trang cuoi] - nut khong co ten accessible. */
  readonly pagerButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    const pickers = page.locator('.react-datepicker__input-container input[placeholder="Chọn ngày"]');
    this.fromInput = pickers.nth(0);
    this.toInput = pickers.nth(1);
    this.rows = page.locator('tbody tr');
    this.pageInfo = page.locator('[class*="_pageInfo_"]');
    this.pagerButtons = this.pageInfo.locator('xpath=following-sibling::button');
  }

  /** Mo man, co the kem query (from/to/page/size/username). Doi API danh sach tra ve. */
  async goto(query: Record<string, string | number> = {}) {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    await this.waitForList(() => this.page.goto(qs ? `${TIMEKEEPING_PATH}?${qs}` : TIMEKEEPING_PATH));
  }

  /** Chay `action` va doi response GET /api/workTime/checkIn ma no gay ra. */
  async waitForList(action: () => Promise<unknown>) {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/workTime/checkIn',
    );
    await action();
    await response;
    await this.page.waitForLoadState('networkidle');
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  async tableRows(): Promise<TimekeepingRow[]> {
    const texts = await this.rows.evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())),
    );
    return texts.map(([day, checkIn, checkOut]) => ({ day, checkIn, checkOut }));
  }

  /** Mo datepicker cua `input`; popup nam duoi sidebar (sidebar chan click) -> mo bang focus. */
  async openPicker(input: Locator) {
    await input.click({ force: true });
    await expect(this.page.locator('.react-datepicker')).toBeVisible();
  }

  /** Cac ngay (so) trong thang dang hien thi cua datepicker dang mo ma bi disable. */
  async disabledDaysInShownMonth(): Promise<number[]> {
    const texts = await this.page
      .locator('.react-datepicker__day--disabled:not(.react-datepicker__day--outside-month)')
      .allInnerTexts();
    return texts.map(Number);
  }

  async closePicker() {
    await this.page.keyboard.press('Escape');
    await expect(this.page.locator('.react-datepicker')).toBeHidden();
  }

  /**
   * Chon ngay trong thang datepicker dang hien thi (thang cua gia tri hien tai).
   * Sidebar de len popup -> click thuong bi chan; dispatch click thang vao o ngay.
   */
  async pickDayInShownMonth(input: Locator, dayOfMonth: number) {
    await this.openPicker(input);
    await this.waitForList(() =>
      this.page
        .locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)')
        .filter({ hasText: new RegExp(`^${dayOfMonth}$`) })
        .first()
        .dispatchEvent('click'),
    );
  }

  /** Query from/to/page/size dang co tren URL. */
  urlQuery(): Record<string, string | null> {
    const params = new URL(this.page.url()).searchParams;
    return Object.fromEntries(['from', 'to', 'page', 'size', 'username'].map((k) => [k, params.get(k)]));
  }

  nextPageButton(): Locator {
    return this.pagerButtons.nth(2);
  }
}
