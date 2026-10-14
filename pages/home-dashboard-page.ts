import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { selectReactOption } from './ron-modal-form-controls';
import type { IsoDate } from '../utils/working-days';

/**
 * Page Object cho Trang chu "Thong ke don Nghi phep - Remote - OT" (/?year=YYYY) - doc 02. Man CHI DOC.
 * - Lich thang la FullCalendar (.fc-*). Moi su kien `<username>: <NP|RM|OT> - <gio tu>-<gio den>`,
 *   class loai `dayoff` / `remote` / `ot`, icon trang thai (dong ho cat = cho duyet).
 * - Filter "Trang thai don" loc o client; "Nguoi quan ly" goi lai API assignedForTeamMembers (poID);
 *   "Nam" chi goi API bieu do dashBoard/workingTimeSummary.
 * - 3 bieu do Recharts (nghi phep / remote / OT) theo nam.
 */

export const HOME_PATH = '/';
export const HOME_TITLE = 'Thống kê đơn Nghỉ phép - Remote - OT';
export const CALENDAR_API = '/api/workTimeRegisters/assignedForTeamMembers';
export const SUMMARY_API = '/api/dashBoard/workingTimeSummary';
export const CALENDAR_COLUMNS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

/** Thu tu combobox trong vung trang: [ngon ngu (header), Trang thai don, Nguoi quan ly, Nam]. */
const COMBO = { status: 1, manager: 2, year: 3 } as const;

export interface CalendarEvent {
  date: IsoDate;
  label: string;
  cssClass: string;
  background: string;
  iconColor: string;
}

export class HomeDashboardPage {
  readonly page: Page;
  readonly main: Locator;
  readonly calendarTitle: Locator;
  readonly events: Locator;
  readonly popover: Locator;

  constructor(page: Page) {
    this.page = page;
    this.main = page.locator('[class*="_mainPage_"]');
    this.calendarTitle = page.locator('.fc-toolbar-title');
    this.events = page.locator('a.fc-event');
    this.popover = page.locator('dialog.fc-popover');
  }

  private isGet = (path: string) => (r: Response) => r.request().method() === 'GET' && new URL(r.url()).pathname === path;

  /** Chay `action`, doi API lich tra ve; tra ve URL request (de doc poID, from, to). */
  async waitForCalendar(action: () => Promise<unknown>): Promise<URL> {
    const response = this.page.waitForResponse(this.isGet(CALENDAR_API));
    await action();
    const url = new URL((await response).url());
    await this.page.waitForLoadState('networkidle');
    return url;
  }

  /** Mo Trang chu, doi ca API lich va API bieu do. */
  async goto(path = HOME_PATH): Promise<URL> {
    const summary = this.page.waitForResponse(this.isGet(SUMMARY_API));
    const url = await this.waitForCalendar(() => this.page.goto(path));
    await summary;
    return url;
  }

  /** Gia tri dang chon cua 3 filter. */
  async selectedFilters(): Promise<{ status: string; manager: string; year: string }> {
    const value = async (i: number) => (await this.main.locator('[class*="singleValue"]').nth(i).innerText()).trim();
    return { status: await value(COMBO.status), manager: await value(COMBO.manager), year: await value(COMBO.year) };
  }

  /** Danh sach option cua 1 filter (mo menu, doc, dong). */
  async options(which: keyof typeof COMBO): Promise<string[]> {
    await this.main.locator('input[role="combobox"]').nth(COMBO[which]).focus();
    await this.page.keyboard.press('ArrowDown');
    const options = this.page.locator('[id*="-option-"]');
    await expect(options.first()).toBeVisible();
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return texts;
  }

  /** Loc trang thai: loc o client, khong goi API. */
  async selectStatus(label: string) {
    await selectReactOption(this.page, this.main, COMBO.status, label);
  }

  async selectManager(username: string): Promise<URL> {
    return this.waitForCalendar(() => selectReactOption(this.page, this.main, COMBO.manager, username));
  }

  /** Doi Nam -> tra ve URL request API bieu do. */
  async selectYear(year: number): Promise<URL> {
    const response = this.page.waitForResponse(this.isGet(SUMMARY_API));
    await selectReactOption(this.page, this.main, COMBO.year, String(year));
    return new URL((await response).url());
  }

  /** Ghi lai request API lich tu luc goi; stop() go listener (trinh duyet dung chung cho ca luot chay). */
  recordCalendarCalls() {
    const calls: string[] = [];
    const onRequest = (r: { url(): string }) => {
      if (new URL(r.url()).pathname === CALENDAR_API) calls.push(r.url());
    };
    this.page.on('request', onRequest);
    return { calls, stop: () => this.page.off('request', onRequest) };
  }

  async next() {
    await this.page.locator('.fc-next-button').click();
  }

  async previous() {
    await this.page.locator('.fc-prev-button').click();
  }

  /** [ngay dau, ngay cuoi] cua luoi lich dang hien (gom ca ngay cua thang ke ben). */
  async gridRange(): Promise<[IsoDate, IsoDate]> {
    const dates = await this.page.locator('td.fc-daygrid-day').evaluateAll((tds) => tds.map((td) => (td as HTMLElement).dataset.date ?? ''));
    return [dates[0], dates[dates.length - 1]];
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.locator('.fc-col-header-cell').allInnerTexts()).map((t) => t.trim());
  }

  /** O "hom nay" tren lich: ngay + mau nen. */
  async todayCell(): Promise<{ date: string | null; background: string }> {
    const cell = this.page.locator('td.fc-day-today');
    return { date: await cell.getAttribute('data-date'), background: await cell.evaluate((td) => getComputedStyle(td).backgroundColor) };
  }

  /** Moi su kien dang hien tren luoi lich. */
  async calendarEvents(): Promise<CalendarEvent[]> {
    return this.events.evaluateAll((links) =>
      links.map((a) => {
        const icon = a.querySelector('svg');
        return {
          date: (a.closest('td') as HTMLElement | null)?.dataset.date ?? '',
          label: (a.textContent ?? '').trim(), // textContent: van doc duoc neu su kien bi an sau "+N"
          cssClass: /\b(dayoff|remote|ot)\b/.exec(a.className)?.[1] ?? '',
          background: getComputedStyle(a).backgroundColor,
          iconColor: icon ? getComputedStyle(icon).color : '',
        };
      }),
    );
  }

  /** Bam su kien thu `index` -> popover chi tiet ngay. */
  async openEventPopover(index: number): Promise<{ title: string; labels: string[] }> {
    await this.events.nth(index).click();
    await expect(this.popover).toBeVisible();
    const labels = await this.popover.locator('.fc-popover-body .fc-event').allInnerTexts();
    return { title: (await this.popover.locator('.fc-popover-title').innerText()).trim(), labels: labels.map((t) => t.trim()) };
  }

  async closePopover() {
    await this.popover.getByRole('button', { name: 'close' }).click();
  }

  /** 3 bieu do: tieu de, legend, nhan truc. */
  async charts(): Promise<{ name: string; legends: string[]; axisLabels: string[] }[]> {
    return this.page.locator('[class*="_lineChartContainer_"]').evaluateAll((charts) =>
      charts.map((c) => ({
        name: (c.querySelector('[class*="_chartName_"]')?.textContent ?? '').trim(),
        legends: [...c.querySelectorAll('.recharts-legend-item-text')].map((x) => (x.textContent ?? '').trim()),
        axisLabels: [...c.querySelectorAll('.recharts-label')].map((x) => (x.textContent ?? '').trim()),
      })),
    );
  }

  /** Nhan tick truc X (thang) cua bieu do thu `index`. */
  async xAxisTicks(index: number): Promise<string[]> {
    return this.page.locator('[class*="_lineChartContainer_"]').nth(index).locator('.recharts-xAxis-tick-labels text').allTextContents();
  }
}
