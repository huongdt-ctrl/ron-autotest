import { expect, type Locator, type Page } from '@playwright/test';
import type { ApprovalStatus, WorkTimeRegister } from '../utils/ron-api-client';
import type { IsoDate } from '../utils/working-days';

/**
 * Page Object cho man "Don dang ky" (/work-time-management) - doc 04: danh sach don cua chinh minh.
 * Bo loc (react-select Loai don / Trang thai / So dong, react-datepicker Tu ngay / Den ngay)
 * dong bo voi query type/status/size/from/to tren URL. Modal Chi tiet / Huy / Thong ke: work-time-request-modals.
 */

export const REQUEST_LIST_PATH = '/work-time-management';
export const NO_DATA_TEXT = 'Không có dữ liệu';

/** Nhan hien thi cua loai don / trang thai (API -> UI). */
export const TYPE_LABELS: Record<string, string> = { DAYOFF: 'Nghỉ phép', REMOTE: 'Remote', OT: 'OT' };
export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  APPROVED: 'Chấp thuận',
  PENDING: 'Chờ xử lý',
  WAIT_CONFIRM: 'Chờ xác nhận',
  REJECTED: 'Từ chối',
  CANCELED: 'Hủy',
};

/** 'YYYY-MM-DD' -> 'DD-MM-YYYY' (dinh dang o datepicker va cot thoi gian). */
export function toDisplayDate(day: IsoDate): string {
  const [y, m, d] = day.split('-');
  return `${d}-${m}-${y}`;
}

export interface RequestRow {
  times: string[]; // moi khoang 1 muc: '08:00 - 12:00, 09-10-2026'
  reason: string;
  approver: string;
  type: string;
  status: string;
}

/** Dong ky vong tren bang, dung du lieu API danh sach. */
export function expectedRow(r: WorkTimeRegister): RequestRow {
  return {
    times: r.timeIntervals.map((t) => `${t.from.slice(0, 5)} - ${t.to.slice(0, 5)}, ${toDisplayDate(t.day)}`),
    reason: r.reason ?? '',
    approver: r.assignedUser?.username ?? '',
    type: TYPE_LABELS[r.type] ?? r.type,
    status: STATUS_LABELS[r.approvalStatus] ?? r.approvalStatus,
  };
}

/** Thu tu combobox cua bo loc (bo combobox Ngon ngu tren header). */
const FILTER_COMBO = { type: 0, status: 1, size: 2 } as const;

export class WorkTimeRequestListPage {
  readonly page: Page;
  readonly filterCombos: Locator;
  readonly fromInput: Locator;
  readonly toInput: Locator;
  readonly rows: Locator;
  readonly pageInfo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.filterCombos = page.locator('input[role="combobox"]:not(header *)');
    const pickers = page.locator('.react-datepicker__input-container input[placeholder="Chọn ngày"]');
    this.fromInput = pickers.nth(0);
    this.toInput = pickers.nth(1);
    this.rows = page.locator('tbody tr');
    this.pageInfo = page.locator('[class*="_pageInfo_"]');
  }

  /** Mo man, co the kem query. Doi API danh sach tra ve. */
  async goto(query: Record<string, string | number> = {}) {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    await this.waitForList(() => this.page.goto(qs ? `${REQUEST_LIST_PATH}?${qs}` : REQUEST_LIST_PATH));
  }

  /** Chay `action`, doi response GET /api/workTimeRegisters no gay ra; tra ve URL request (de soi query gui len API). */
  async waitForList(action: () => Promise<unknown>): Promise<URL> {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/workTimeRegisters',
    );
    await action();
    const url = new URL((await response).url());
    await this.page.waitForLoadState('networkidle');
    return url;
  }

  /** Chon option cua bo loc theo nhan hien thi; tra ve URL request API danh sach sau khi loc. */
  async selectFilter(filter: keyof typeof FILTER_COMBO, label: string): Promise<URL> {
    const combo = this.filterCombos.nth(FILTER_COMBO[filter]);
    await combo.focus();
    await this.page.keyboard.press('ArrowDown');
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const option = this.page.locator('[role="option"], [id*="-option-"]').filter({ hasText: new RegExp(`^${escaped}$`) }).first();
    return this.waitForList(() => option.click());
  }

  /** Nhan cac option cua 1 bo loc (mo menu, doc, dong). */
  async filterOptions(filter: keyof typeof FILTER_COMBO): Promise<string[]> {
    await this.filterCombos.nth(FILTER_COMBO[filter]).focus();
    await this.page.keyboard.press('ArrowDown');
    const options = this.page.locator('[role="option"], [id*="-option-"]');
    await expect(options.first()).toBeVisible();
    const labels = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  async tableRows(): Promise<RequestRow[]> {
    return this.rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const td = [...tr.querySelectorAll('td')];
        const text = (i: number) => (td[i]?.textContent ?? '').trim();
        const times = [...td[0].querySelectorAll('[class*="_timeItem_"]')].map((s) => (s.textContent ?? '').trim());
        return { times, reason: text(1), approver: text(2), type: text(3), status: text(4) };
      }),
    );
  }

  /** Dong co cot Li do = `reason` (li do AUTOTEST_ la duy nhat). */
  rowByReason(reason: string): Locator {
    return this.rows.filter({ has: this.page.locator('td').nth(1).getByText(reason, { exact: true }) });
  }

  /** Nut 👁 (Xem chi tiet) va 🗑 (Xoa) o cot Tuy chinh. */
  detailButton(row: Locator): Locator {
    return row.locator('td').nth(5).locator('button').nth(0);
  }

  cancelButton(row: Locator): Locator {
    return row.locator('td').nth(5).locator('button').nth(1);
  }

  /** Mo datepicker cua `input`; popup nam duoi sidebar (sidebar chan click) -> mo bang force click. */
  async openPicker(input: Locator) {
    await input.click({ force: true });
    await expect(this.page.locator('.react-datepicker')).toBeVisible();
  }

  /** Cac ngay (so) bi disable trong thang dang hien thi cua datepicker dang mo. */
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

  /** Query cua man dang co tren URL. */
  urlQuery(): Record<string, string | null> {
    const params = new URL(this.page.url()).searchParams;
    return Object.fromEntries(['page', 'size', 'type', 'status', 'from', 'to'].map((k) => [k, params.get(k)]));
  }
}
