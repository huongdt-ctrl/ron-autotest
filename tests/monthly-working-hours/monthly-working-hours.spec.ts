import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import { MONTHLY_HOURS_COLUMNS, MONTHLY_HOURS_PATH, MonthlyWorkingHoursPage } from '../../pages/monthly-working-hours-page';
import { formatTimekeepingDay } from '../../pages/user-timekeeping-list-page';
import type { MonthlyWorkingDay, RonApiClient } from '../../utils/ron-api-client';
import { monthRange, todayInVietnam, type IsoDate } from '../../utils/working-days';

// Man "Gio cong thang" (doc 09) - CHI DOC (writeGuard chan moi request ghi).
// Gio cong do server tinh tu cham cong + don -> lay API lam oracle cho UI. Thang dung de so
// khop = thang moi nhat account test co du lieu cham cong; khong co -> skip.

const SEARCH_FROM: IsoDate = '2025-01-01';
const ORANGE_COLUMNS = { remote: 2, dayOff: 3, overtime: 5 } as const;

const ymOf = (day: IsoDate) => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
const isWeekend = (day: IsoDate) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
const daysInMonth = (day: IsoDate) => Number(monthRange(day)[1].slice(8, 10));

/** Thang moi nhat co ban ghi cham cong: nam/thang + ban ghi check-in/out trong thang. */
async function latestMonthWithCheckIns(api: RonApiClient) {
  const { results } = await api.listMyCheckIns(SEARCH_FROM, todayInVietnam());
  if (!results.length) return null;
  const [from, to] = monthRange(results[0].day); // API tra moi nhat truoc
  return { from, to, ...ymOf(from), checkIns: results.filter((r) => r.day >= from && r.day <= to) };
}

const toSeconds = (hms: string) => hms.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);

/**
 * Gio cong van phong theo QD-04-02 muc 1.1 + 1.5 cho ngay vao trong khung 7:00-9:00:
 * phai ra luc (vao + 8 gio + 1 gio nghi trua); ve som -> phan thieu lam tron LEN buoc 15 phut.
 * Vao truoc 7:00 tinh nhu 7:00.
 */
function expectedOfficeHours(checkIn: string, checkOut: string): number {
  const start = Math.max(toSeconds(checkIn), toSeconds('07:00:00'));
  const shortSeconds = Math.max(0, start + 9 * 3600 - toSeconds(checkOut));
  return 8 - Math.ceil(shortSeconds / 900) * 0.25;
}

const toUiRow = (d: MonthlyWorkingDay) => ({
  day: formatTimekeepingDay(d.date),
  office: d.checkInTotal,
  // CAN CHECK LAI: cot "Gio cham cong remote" tam map remoteTimeTotal. Du lieu dev (do 08/10) moi ngay
  // remoteTimeTotal = checkInRemoteTotal = 0 nen chua phan biet duoc. Khi co ngay cham cong remote that:
  // RON-MWH-004 fail o cot remote -> doi sang checkInRemoteTotal. Theo doi o docs/ron-system/autotest-bugs-cho-log.md
  remote: d.remoteTimeTotal,
  dayOff: d.dayOffTimeTotal,
  total: d.workTimeTotal,
  overtime: d.overTimeTotal,
});

test.describe('Gio cong thang - tong hop gio cong theo ngay', () => {
  let screen: MonthlyWorkingHoursPage;

  test.beforeEach(async ({ employeePage }) => {
    screen = new MonthlyWorkingHoursPage(employeePage);
  });

  test('[RON-MWH-001] Mo tu sidebar Cham cong thi mac dinh thang/nam hien tai, du 6 cot, moi ngay 1 dong @smoke', async ({ employeePage }) => {
    // Arrange
    const sidebar = new AppSidebarPage(employeePage);
    const today = todayInVietnam();
    const { year, month } = ymOf(today);
    await employeePage.goto('/');
    await sidebar.expandAll();

    // Act
    await screen.waitForData(() => sidebar.nav.locator(`a[href="${MONTHLY_HOURS_PATH}"]`).click());

    // Assert
    const params = new URL(employeePage.url()).searchParams;
    expect({ year: params.get('year'), month: params.get('month') }).toEqual({ year: String(year), month: String(month) });
    expect(await screen.selectedMonthYear()).toEqual({ month: String(month), year: String(year) });
    expect(await screen.columnHeaders()).toEqual(MONTHLY_HOURS_COLUMNS);
    await expect(screen.rows).toHaveCount(daysInMonth(today));
    await expect(screen.rows.first().locator('td').first()).toHaveText(formatTimekeepingDay(`${today.slice(0, 7)}-01`));
  });

  test('[RON-MWH-002] O Thang co 1-12, o Nam co 2014-2038', async () => {
    // Arrange
    await screen.goto();

    // Act
    const months = await screen.options('month');
    const years = await screen.options('year');

    // Assert
    expect(months).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    expect(years).toEqual(Array.from({ length: 25 }, (_, i) => String(2014 + i)));
  });

  test('[RON-MWH-003] Doi Thang sang 2 thi URL, 2 API va so dong theo thang 2', async ({ employeePage }) => {
    // Arrange
    const { year } = ymOf(todayInVietnam());
    const febStart = `${year}-02-01`;
    const [, febEnd] = monthRange(febStart);
    await screen.goto();
    const detailCall = employeePage.waitForRequest((r) => r.url().includes(`/api/workTime/detail?from=${febStart}&to=${febEnd}`));
    const monthlyCall = employeePage.waitForRequest((r) => r.url().includes('/api/work-time/monthly') && r.url().includes(`year=${year}&month=2`));

    // Act
    await screen.selectMonth(2);

    // Assert
    await Promise.all([detailCall, monthlyCall]);
    expect(new URL(employeePage.url()).searchParams.get('month')).toBe('2');
    await expect(screen.rows).toHaveCount(daysInMonth(febStart));
    await expect(screen.rows.first().locator('td').first()).toHaveText(formatTimekeepingDay(febStart));
  });

  test('[RON-MWH-004] Bang hien dung gio cong API tung ngay; Tong = VP + remote + nghi phep, OT tach rieng (QD-04-02 muc 4)', async ({ api }) => {
    // Arrange
    const month = await latestMonthWithCheckIns(api);
    test.skip(!month, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}`);
    const days = await api.monthlyWorkingHours(month!.year, month!.month);

    // Act
    await screen.openMonth(month!.year, month!.month);
    const rows = await screen.tableRows();

    // Assert
    expect(rows).toEqual(days.map(toUiRow));
    for (const d of days) {
      const sum = d.checkInTotal + d.checkInRemoteTotal + d.remoteTimeTotal + d.dayOffTimeTotal;
      expect(d.workTimeTotal, `Tong gio cong ngay ${d.date}`).toBeCloseTo(sum, 5);
    }
  });

  test('[RON-MWH-005] Gio van phong lam tron ve som theo buoc 15 phut (QD-04-02 muc 1.5)', async ({ api }) => {
    // Arrange: ngay thuong, vao trong khung <= 9:00, khong co don nao (gio chi den tu may cham cong)
    const month = await latestMonthWithCheckIns(api);
    test.skip(!month, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}`);
    const detail = await api.workTimeDetail(month!.from, month!.to);
    const hasRequest = (day: IsoDate) => {
      const d = detail[day];
      return !!d && [d.dayOff, d.remoteTime, d.checkInRegister, d.checkInRegisterRemote].some((list) => list.length > 0);
    };
    const samples = month!.checkIns.filter(
      (r) => r.checkIn && r.checkOut && r.checkIn <= '09:00:00' && !isWeekend(r.day) && !hasRequest(r.day),
    );
    test.skip(samples.length === 0, 'Thang khong co ngay cham cong vao truoc 9:00 ma khong co don');

    // Act
    const days = new Map((await api.monthlyWorkingHours(month!.year, month!.month)).map((d) => [d.date, d]));

    // Assert
    for (const r of samples) {
      expect(days.get(r.day)?.checkInTotal, `Ngay ${r.day} vao ${r.checkIn} ra ${r.checkOut}`).toBe(
        expectedOfficeHours(r.checkIn!, r.checkOut!),
      );
    }
  });

  test('[RON-MWH-006] Badge cot Tong: T7/CN nen xam; ngay thuong du 8 xanh, thieu do', async ({ api }) => {
    // Arrange
    const month = await latestMonthWithCheckIns(api);
    test.skip(!month, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}`);
    const days = await api.monthlyWorkingHours(month!.year, month!.month);
    await screen.openMonth(month!.year, month!.month);

    // Act + Assert
    for (const [index, d] of days.entries()) {
      const badge = await screen.totalBadge(index);
      if (isWeekend(d.date)) {
        expect(badge, `Ngay ${d.date} (cuoi tuan)`).toBe('holiday');
        expect(await screen.rowBackground(index), `Nen ngay ${d.date}`).toBe('rgb(240, 240, 240)');
      } else {
        expect(badge, `Ngay ${d.date} tong ${d.workTimeTotal}`).toBe(d.workTimeTotal >= 8 ? 'full' : 'lost');
      }
    }
  });

  test('[RON-MWH-007] So to cam dung o cot co don chua duyet (remote / nghi phep / OT)', async ({ api }) => {
    // Arrange: thang hien tai thuong co don cho duyet cua account test
    const { year, month } = ymOf(todayInVietnam());
    const days = await api.monthlyWorkingHours(year, month);
    test.skip(!days.some((d) => !d.approvalRemote || !d.approvalDayOff || !d.approvalOT), 'Thang hien tai khong co don chua duyet');
    await screen.goto();

    // Act + Assert
    for (const [index, d] of days.entries()) {
      expect(await screen.isOrange(index, ORANGE_COLUMNS.remote), `Remote ${d.date}`).toBe(!d.approvalRemote);
      expect(await screen.isOrange(index, ORANGE_COLUMNS.dayOff), `Nghi phep ${d.date}`).toBe(!d.approvalDayOff);
      expect(await screen.isOrange(index, ORANGE_COLUMNS.overtime), `OT ${d.date}`).toBe(!d.approvalOT);
    }
  });

  test('[RON-MWH-008] Re chuot o Gio van phong hien gio checkin/checkout cua ngay va nut Tao don ngay', async ({ api }) => {
    // Arrange
    const month = await latestMonthWithCheckIns(api);
    test.skip(!month, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}`);
    const record = month!.checkIns.find((r) => r.checkIn && r.checkOut)!;
    await screen.openMonth(month!.year, month!.month);

    // Act
    const tooltip = await screen.tooltipOf(Number(record.day.slice(8, 10)) - 1, 1);

    // Assert
    expect(tooltip).toContain('Giờ chấm công văn phòng');
    expect(tooltip).toContain(record.checkIn!);
    expect(tooltip).toContain(record.checkOut!);
    expect(tooltip).toContain('Tạo đơn ngay');
  });

  // BUG (do 08/10): mo link co san month/year -> app ghi de URL ve thang hien tai va hien du lieu
  // thang hien tai, trong khi o Thang van hien thang tren link. Test ghi lai HANH VI HIEN TAI;
  // khi dev sua -> doi assertion: URL giu month=X, bang hien dung so ngay cua thang X.
  test('[RON-MWH-009] BUG da biet: mo link month khac thang hien tai thi o Thang lech voi du lieu', async ({ employeePage }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Deep link month/year bi bo qua, o Thang hien sai' });

    // Arrange
    const today = todayInVietnam();
    const { year, month } = ymOf(today);
    const otherMonth = month === 2 ? 3 : 2;

    // Act
    await screen.goto(`?page=1&size=20&year=${year}&month=${otherMonth}`);

    // Assert (hanh vi bug)
    expect(new URL(employeePage.url()).searchParams.get('month')).toBe(String(month));
    expect((await screen.selectedMonthYear()).month).toBe(String(otherMonth));
    await expect(screen.rows.first().locator('td').first()).toHaveText(formatTimekeepingDay(`${today.slice(0, 7)}-01`));
  });
});
