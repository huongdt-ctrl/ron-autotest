import { expect, type Locator, type Page } from '@playwright/test';
import { STATUS_LABELS } from './work-time-request-list-page';
import type { CheckInRegister } from '../utils/ron-api-client';

/**
 * Page Object cho man "Phe duyet don cham cong" (/check-in-register-approve) - doc 15, role TBP.
 * Danh sach don cham cong ma user dang dang nhap duoc chon lam nguoi kiem duyet.
 * Bo loc: o "Nhap tai khoan" (goi API ngay khi go), react-select Trang thai / So dong, datepicker
 * Tu ngay / Den ngay; dong bo query URL (status/username = 'null' khi khong loc -> API bo 2 tham so nay).
 * Cot Tuy chinh chi co 1 icon 👁 mo modal "Thong tin chi tiet" + Quyet dinh (CHECK_IN_DECISION).
 */

export const CHECK_IN_APPROVE_PATH = '/check-in-register-approve';
const ASSIGNED_API_PATH = '/api/workTime/checkInRegisters/assigned';

export const CHECK_IN_APPROVE_COLUMNS = [
  'Người đăng ký',
  'Ngày',
  'Thời gian checkin',
  'Thời gian checkout',
  'Hình thức làm việc',
  'Lý do',
  'Trạng thái',
  'Tùy chỉnh',
];
export const OFFICE_WORK_MODE = 'Văn phòng';

export interface CheckInApproveRow {
  requester: string;
  day: string; // 'yyyy-MM-dd' (khac cac man khac, doc 15 diem bat thuong 6)
  checkIn: string; // 'HH:mm'
  checkOut: string;
  workMode: string;
  reason: string;
  status: string;
}

/** Dong ky vong tren bang, dung du lieu API assigned. Nhan don remote chua do duoc -> chi doi khac "Van phong". */
export function expectedCheckInApproveRow(r: CheckInRegister): Omit<CheckInApproveRow, 'workMode'> & { workMode: unknown } {
  return {
    requester: r.user?.username ?? '',
    day: r.day,
    checkIn: r.checkIn.slice(0, 5),
    checkOut: r.checkOut.slice(0, 5),
    workMode: r.isRemote ? expect.not.stringMatching(new RegExp(`^${OFFICE_WORK_MODE}$`)) : OFFICE_WORK_MODE,
    reason: r.reason ?? '',
    status: STATUS_LABELS[r.approvalStatus] ?? r.approvalStatus,
  };
}

/** Thu tu combobox cua bo loc (bo combobox Ngon ngu tren header). So dong chi hien khi bang co du lieu. */
const FILTER_COMBO = { status: 0, size: 1 } as const;

export class CheckInApproveListPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly filterCombos: Locator;
  readonly fromInput: Locator;
  readonly toInput: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[placeholder="Nhập tài khoản"]');
    this.filterCombos = page.locator('input[role="combobox"]:not(header *)');
    const pickers = page.locator('.react-datepicker__input-container input[placeholder="Chọn ngày"]');
    this.fromInput = pickers.nth(0);
    this.toInput = pickers.nth(1);
    this.rows = page.locator('tbody tr');
  }

  /** Mo man, co the kem query. Doi API assigned tra ve; tra ve URL request API. */
  async goto(query: Record<string, string | number> = {}): Promise<URL> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    return this.waitForList(() => this.page.goto(qs ? `${CHECK_IN_APPROVE_PATH}?${qs}` : CHECK_IN_APPROVE_PATH));
  }

  /** Chay `action`, doi response GET API assigned thoa `match`; tra ve URL request (soi query gui len API). */
  async waitForList(action: () => Promise<unknown>, match: (url: URL) => boolean = () => true): Promise<URL> {
    const response = this.page.waitForResponse((r) => {
      const url = new URL(r.url());
      return r.request().method() === 'GET' && url.pathname === ASSIGNED_API_PATH && match(url);
    });
    await action();
    const url = new URL((await response).url());
    await this.page.waitForLoadState('networkidle');
    return url;
  }

  /** Go ten tai khoan; o nay goi API theo tung ky tu -> doi request mang du ten. */
  async filterUsername(username: string): Promise<URL> {
    return this.waitForList(
      () => this.usernameInput.fill(username),
      (url) => url.searchParams.get('username') === username,
    );
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

  async tableRows(): Promise<CheckInApproveRow[]> {
    return this.rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const text = (i: number) => (tr.querySelectorAll('td')[i]?.textContent ?? '').trim();
        return { requester: text(0), day: text(1), checkIn: text(2), checkOut: text(3), workMode: text(4), reason: text(5), status: text(6) };
      }),
    );
  }

  /** Dong co cot Ly do = `reason` (li do AUTOTEST_ kem timestamp la duy nhat). */
  rowByReason(reason: string): Locator {
    return this.rows.filter({ has: this.page.locator('td').nth(5).getByText(reason, { exact: true }) });
  }

  cell(row: Locator, column: (typeof CHECK_IN_APPROVE_COLUMNS)[number]): Locator {
    return row.locator('td').nth(CHECK_IN_APPROVE_COLUMNS.indexOf(column));
  }

  /** Icon 👁 o cot Tuy chinh: mo modal Thong tin chi tiet + Quyet dinh. */
  actionButton(row: Locator): Locator {
    return this.cell(row, 'Tùy chỉnh').locator('button').first();
  }

  /** Query cua man dang co tren URL. */
  urlQuery(): Record<string, string | null> {
    const params = new URL(this.page.url()).searchParams;
    return Object.fromEntries(['page', 'size', 'from', 'to', 'status', 'username'].map((k) => [k, params.get(k)]));
  }

  private async openFilterMenu(filter: keyof typeof FILTER_COMBO) {
    await this.filterCombos.nth(FILTER_COMBO[filter]).focus();
    await this.page.keyboard.press('ArrowDown');
  }

  private options(): Locator {
    return this.page.locator('[role="option"], [id*="-option-"]');
  }
}
