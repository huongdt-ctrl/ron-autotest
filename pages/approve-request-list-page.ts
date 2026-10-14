import { expect, type Locator, type Page } from '@playwright/test';
import { STATUS_LABELS, TYPE_LABELS, toDisplayDate } from './work-time-request-list-page';
import type { WorkTimeRegister } from '../utils/ron-api-client';

/**
 * Page Object cho man "Phe duyet don" (/approve-management) - doc 14, role TBP.
 * Danh sach don ma user dang dang nhap duoc chon lam nguoi kiem duyet. Bo loc giong man Don dang ky
 * (react-select Loai don / Trang thai / So dong, datepicker Tu ngay / Den ngay, dong bo query URL).
 * Khac Don dang ky: cot "Nguoi dang ky" thay cho "Nguoi kiem duyet"; 2 icon o cot Tuy chinh deu mo
 * modal Chi tiet + Quyet dinh (approve-decision-modal).
 */

export const APPROVE_LIST_PATH = '/approve-management';
const ASSIGNED_API_PATH = '/api/workTimeRegisters/assigned';

export const APPROVE_LIST_COLUMNS = ['Thời gian đăng ký', 'Người đăng ký', 'Lí do', 'Loại đơn', 'Trạng thái', 'Tùy chỉnh'];

export interface ApproveRow {
  times: string[]; // moi khoang 1 muc: '08:00 - 17:00, 28-10-2026'
  requester: string;
  reason: string;
  type: string;
  status: string;
}

/** Dong ky vong tren bang, dung du lieu API assigned. */
export function expectedApproveRow(r: WorkTimeRegister & { user?: { username: string } }): ApproveRow {
  return {
    times: r.timeIntervals.map((t) => `${t.from.slice(0, 5)} - ${t.to.slice(0, 5)}, ${toDisplayDate(t.day)}`),
    requester: r.user?.username ?? '',
    reason: (r.reason ?? '').trim(), // UI trim textContent: li do chi co dau cach hien thanh rong
    type: TYPE_LABELS[r.type] ?? r.type,
    status: STATUS_LABELS[r.approvalStatus] ?? r.approvalStatus,
  };
}

/** Thu tu combobox cua bo loc (bo combobox Ngon ngu tren header). So dong chi hien khi bang co du lieu. */
const FILTER_COMBO = { type: 0, status: 1, size: 2 } as const;

export class ApproveRequestListPage {
  readonly page: Page;
  readonly filterCombos: Locator;
  readonly fromInput: Locator;
  readonly toInput: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.filterCombos = page.locator('input[role="combobox"]:not(header *)');
    const pickers = page.locator('.react-datepicker__input-container input[placeholder="Chọn ngày"]');
    this.fromInput = pickers.nth(0);
    this.toInput = pickers.nth(1);
    this.rows = page.locator('tbody tr');
  }

  /** Mo man, co the kem query. Doi API assigned tra ve; tra ve URL request API. */
  async goto(query: Record<string, string | number> = {}): Promise<URL> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    return this.waitForList(() => this.page.goto(qs ? `${APPROVE_LIST_PATH}?${qs}` : APPROVE_LIST_PATH));
  }

  /** Chay `action`, doi response GET API assigned no gay ra; tra ve URL request (soi query gui len API). */
  async waitForList(action: () => Promise<unknown>): Promise<URL> {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === ASSIGNED_API_PATH,
    );
    await action();
    const url = new URL((await response).url());
    await this.page.waitForLoadState('networkidle');
    return url;
  }

  /** Chon option cua bo loc theo nhan hien thi; tra ve URL request API sau khi loc. */
  async selectFilter(filter: keyof typeof FILTER_COMBO, label: string): Promise<URL> {
    await this.openFilterMenu(filter);
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const option = this.options().filter({ hasText: new RegExp(`^${escaped}$`) }).first();
    return this.waitForList(() => option.click());
  }

  /** Nhan cac option cua 1 bo loc (mo menu, doc, dong). */
  async filterOptions(filter: keyof typeof FILTER_COMBO): Promise<string[]> {
    await this.openFilterMenu(filter);
    await expect(this.options().first()).toBeVisible();
    const labels = (await this.options().allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  async tableRows(): Promise<ApproveRow[]> {
    return this.rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const td = [...tr.querySelectorAll('td')];
        const text = (i: number) => (td[i]?.textContent ?? '').trim();
        const times = [...(td[0]?.querySelectorAll('[class*="_timeItem_"]') ?? [])].map((s) => (s.textContent ?? '').trim());
        return { times, requester: text(1), reason: text(2), type: text(3), status: text(4) };
      }),
    );
  }

  /** Dong co cot Li do = `reason` (li do AUTOTEST_ la duy nhat). */
  rowByReason(reason: string): Locator {
    return this.rows.filter({ has: this.page.locator('td').nth(2).getByText(reason, { exact: true }) });
  }

  /** Icon o cot Tuy chinh (chi 1 icon, do 2026-10-13), mo modal Chi tiet + Quyet dinh. */
  actionButton(row: Locator): Locator {
    return row.locator('td').nth(5).locator('button').first();
  }

  /** Query cua man dang co tren URL. */
  urlQuery(): Record<string, string | null> {
    const params = new URL(this.page.url()).searchParams;
    return Object.fromEntries(['page', 'size', 'type', 'status', 'from', 'to'].map((k) => [k, params.get(k)]));
  }

  private async openFilterMenu(filter: keyof typeof FILTER_COMBO) {
    await this.filterCombos.nth(FILTER_COMBO[filter]).focus();
    await this.page.keyboard.press('ArrowDown');
  }

  private options(): Locator {
    return this.page.locator('[role="option"], [id*="-option-"]');
  }
}
