import { expect, type Locator, type Page } from '@playwright/test';
import { selectReactOption } from './ron-modal-form-controls';

/**
 * Page Object cho man "Gio cong thang" (/monthly-working-hours) - doc 09. Man CHI DOC.
 * Bo loc Thang / Nam (react-select) dong bo query month/year; doi filter goi 2 API:
 * work-time/monthly (gio theo ngay) + workTime/detail (don trong thang).
 * Bang: moi ngay trong thang 1 dong, 6 cot. Cot Tong la badge: _full_ (du 8), _lost_ (thieu),
 * _holiday_ (T7/CN/le). So mau cam = ngay co don chua duyet.
 */

export const MONTHLY_HOURS_PATH = '/monthly-working-hours';

export const MONTHLY_HOURS_COLUMNS = [
  'Ngày',
  'Giờ chấm công văn phòng',
  'Giờ chấm công remote',
  'Giờ nghỉ phép',
  'Tổng giờ công',
  'Giờ OT',
];

/** Thu tu combobox trong vung trang: [ngon ngu (header), Thang, Nam]. */
const MONTH_COMBO_INDEX = 1;
const YEAR_COMBO_INDEX = 2;

export type TotalBadge = 'full' | 'lost' | 'holiday' | 'unknown';

export interface MonthlyHoursRow {
  day: string;
  office: number;
  remote: number;
  dayOff: number;
  total: number;
  overtime: number;
}

export class MonthlyWorkingHoursPage {
  readonly page: Page;
  readonly main: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.main = page.locator('[class*="_mainPage_"]');
    this.rows = page.locator('tbody tr');
  }

  /** Chay `action` va doi ca 2 API cua man tra ve (monthly + detail). */
  async waitForData(action: () => Promise<unknown>) {
    const isApi = (path: string) => (r: import('@playwright/test').Response) =>
      r.request().method() === 'GET' && new URL(r.url()).pathname === path;
    const monthly = this.page.waitForResponse(isApi('/api/work-time/monthly'));
    const detail = this.page.waitForResponse(isApi('/api/workTime/detail'));
    await action();
    await Promise.all([monthly, detail]);
    await this.page.waitForLoadState('networkidle');
  }

  async goto(query = '') {
    await this.waitForData(() => this.page.goto(`${MONTHLY_HOURS_PATH}${query}`));
  }

  /** Gia tri dang hien o o Thang, o Nam. */
  async selectedMonthYear(): Promise<{ month: string; year: string }> {
    const values = this.main.locator('[class*="singleValue"]');
    return { month: (await values.nth(MONTH_COMBO_INDEX).innerText()).trim(), year: (await values.nth(YEAR_COMBO_INDEX).innerText()).trim() };
  }

  async selectMonth(month: number) {
    await this.waitForData(() => selectReactOption(this.page, this.main, MONTH_COMBO_INDEX, String(month)));
  }

  async selectYear(year: number) {
    await this.waitForData(() => selectReactOption(this.page, this.main, YEAR_COMBO_INDEX, String(year)));
  }

  /**
   * Mo man roi chon Nam/Thang tren bo loc. KHONG mo bang link ?year=&month= vi app bo qua
   * query nay va luon ve thang hien tai (bug, xem RON-MWH-009).
   */
  async openMonth(year: number, month: number) {
    await this.goto();
    const current = await this.selectedMonthYear();
    if (current.year !== String(year)) await this.selectYear(year);
    if ((await this.selectedMonthYear()).month !== String(month)) await this.selectMonth(month);
  }

  /** Danh sach option cua o Thang / Nam (mo menu, doc, dong). */
  async options(which: 'month' | 'year'): Promise<string[]> {
    await this.main.locator('input[role="combobox"]').nth(which === 'month' ? MONTH_COMBO_INDEX : YEAR_COMBO_INDEX).focus();
    await this.page.keyboard.press('ArrowDown');
    const options = this.page.locator('[id*="-option-"]');
    await expect(options.first()).toBeVisible();
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return texts;
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  async tableRows(): Promise<MonthlyHoursRow[]> {
    const texts = await this.rows.evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())),
    );
    return texts.map(([day, office, remote, dayOff, total, overtime]) => ({
      day,
      office: Number(office),
      remote: Number(remote),
      dayOff: Number(dayOff),
      total: Number(total),
      overtime: Number(overtime),
    }));
  }

  /** Loai badge o cot Tong cua dong `index`, theo class CSS module. */
  async totalBadge(index: number): Promise<TotalBadge> {
    const cls = (await this.rows.nth(index).locator('td').nth(4).locator('div div').getAttribute('class')) ?? '';
    const match = /_(full|lost|holiday)_/.exec(cls);
    return (match?.[1] as TotalBadge) ?? 'unknown';
  }

  /** Mau nen cua dong `index` (T7/CN/le: xam rgb(240, 240, 240)). */
  async rowBackground(index: number): Promise<string> {
    return this.rows.nth(index).locator('td').first().evaluate((td) => getComputedStyle(td).backgroundColor);
  }

  /** O so cua cot `column` (1..5 bo cot Ngay; cot 4 la badge Tong) o dong `index`. */
  cell(index: number, column: number): Locator {
    return this.rows.nth(index).locator('td').nth(column).locator('span').first();
  }

  /** So trong o co to cam (ngay co don chua duyet) khong. */
  async isOrange(index: number, column: number): Promise<boolean> {
    return this.cell(index, column).evaluate((el) => (el as HTMLElement).style.color === 'orange');
  }

  /** Re chuot vao o -> noi dung tooltip (vd gio checkin/checkout + "Tao don ngay"). */
  async tooltipOf(index: number, column: number): Promise<string> {
    await this.cell(index, column).hover();
    const tooltip = this.page.locator('[role="tooltip"]').filter({ visible: true }).last();
    await expect(tooltip).toBeVisible();
    return tooltip.innerText();
  }
}
