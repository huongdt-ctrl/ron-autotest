import type { Locator, Page } from '@playwright/test';
import type { CheckInRegister } from '../utils/ron-api-client';
import { STATUS_LABELS } from './work-time-request-list-page';

/**
 * Page Object cho danh sach "Don dang ky cham cong" (/check-in-register) - doc 10.
 * Bo loc Tu ngay / Den ngay dong bo voi query from/to tren URL. Form "Don cham cong": check-in-register-form-page.
 * Cot Ngay dung dinh dang yyyy-MM-dd (khac cac man khac, doc 10 diem bat thuong 4).
 */

export const CHECK_IN_LIST_PATH = '/check-in-register';
export const CHECK_IN_LIST_API = '/api/workTime/checkInRegisters';
export const CHECK_IN_LIST_COLUMNS = [
  'Người kiểm duyệt',
  'Ngày',
  'Thời gian checkin',
  'Thời gian checkout',
  'Hình thức làm việc',
  'Lý do',
  'Trạng thái',
  'Tùy chỉnh',
];

export interface CheckInListRow {
  day: string;
  checkIn: string;
  checkOut: string;
  workMode: string;
  reason: string;
  status: string;
}

/** Dong ky vong tren bang tu du lieu API (bo cot Nguoi kiem duyet: API danh sach khong tra username). */
export function expectedCheckInRow(r: CheckInRegister): CheckInListRow {
  return {
    day: r.day,
    checkIn: r.checkIn.slice(0, 5),
    checkOut: r.checkOut.slice(0, 5),
    workMode: r.isRemote ? 'Remote' : 'Văn phòng',
    reason: (r.reason ?? '').trim(), // UI trim textContent
    status: STATUS_LABELS[r.approvalStatus] ?? r.approvalStatus,
  };
}

export class CheckInRegisterListPage {
  readonly page: Page;
  readonly rows: Locator;
  readonly pageInfo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rows = page.locator('tbody tr');
    this.pageInfo = page.locator('[class*="_pageInfo_"]');
  }

  /** Mo man (co the kem query), doi GET danh sach; tra ve URL request de soi query gui len API. */
  async goto(query: Record<string, string | number> = {}): Promise<URL> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === CHECK_IN_LIST_API,
    );
    await this.page.goto(qs ? `${CHECK_IN_LIST_PATH}?${qs}` : CHECK_IN_LIST_PATH);
    const url = new URL((await response).url());
    await this.page.waitForLoadState('networkidle');
    return url;
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  async tableRows(): Promise<CheckInListRow[]> {
    return this.rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const text = (i: number) => (tr.querySelectorAll('td')[i]?.textContent ?? '').trim();
        return { day: text(1), checkIn: text(2), checkOut: text(3), workMode: text(4), reason: text(5), status: text(6) };
      }),
    );
  }

  /** Toast chua `text`. Toast tu tat sau vai giay -> bat dau cho TRUOC thao tac gay ra no. */
  toast(text: string): Locator {
    return this.page.locator('.Toastify__toast').filter({ hasText: text }).first();
  }

  /** Query cua man dang co tren URL. */
  urlQuery(): Record<string, string | null> {
    const params = new URL(this.page.url()).searchParams;
    return Object.fromEntries(['page', 'size', 'from', 'to'].map((k) => [k, params.get(k)]));
  }
}
