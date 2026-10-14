import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import {
  formatTimekeepingDay,
  NO_DATA_TEXT,
  TIMEKEEPING_PATH,
  toDisplayDate,
  UserTimekeepingListPage,
} from '../../pages/user-timekeeping-list-page';
import type { CheckInRecord, RonApiClient } from '../../utils/ron-api-client';
import { monthRange, shiftMonthStart, todayInVietnam, type IsoDate } from '../../utils/working-days';

// Man "Thoi gian cham cong" (doc 08) - CHI DOC, khong tao du lieu (writeGuard chan moi request ghi).
// Du lieu cham cong do may cham cong / admin import, automation khong tao duoc -> lay API lam
// oracle cho UI, khoang ngay chon dong theo du lieu account test; khong co du lieu -> skip.

/** Cua so tim du lieu cham cong cua account test (dev hien chi co toi 05/2026). */
const SEARCH_FROM: IsoDate = '2025-01-01';
const HH_MM_SS = /^\d{2}:\d{2}:\d{2}$/;
/** Username nguoi khac de thu IDOR qua param `username` tren URL (doc 08 diem bat thuong 3). */
const OTHER_USERNAME = process.env.RON_OTHER_USERNAME || 'admin';

/** Thang moi nhat co du lieu cham cong: [from, to] cua thang do + ban ghi trong thang. */
async function latestMonthWithData(api: RonApiClient) {
  const { results } = await api.listMyCheckIns(SEARCH_FROM, todayInVietnam());
  if (!results.length) return null;
  const [from, to] = monthRange(results[0].day); // API tra moi nhat truoc
  const records = results.filter((r) => r.day >= from && r.day <= to);
  return { from, to, records };
}

const toRow = (r: CheckInRecord) => ({ day: formatTimekeepingDay(r.day), checkIn: r.checkIn ?? '', checkOut: r.checkOut ?? '' });

test.describe('Thoi gian cham cong - xem nhat ky check-in/out', () => {
  let screen: UserTimekeepingListPage;

  test.beforeEach(async ({ employeePage }) => {
    screen = new UserTimekeepingListPage(employeePage);
  });

  test('[RON-TIMEKEEP-001] Mo tu sidebar Cham cong thi mac dinh loc thang hien tai @smoke', async ({ employeePage }) => {
    // Arrange
    const sidebar = new AppSidebarPage(employeePage);
    const [monthStart, monthEnd] = monthRange(todayInVietnam());
    await employeePage.goto('/');
    await sidebar.expandAll();

    // Act
    await screen.waitForList(() => sidebar.nav.locator(`a[href="${TIMEKEEPING_PATH}"]`).click());

    // Assert
    expect(screen.urlQuery()).toMatchObject({ from: monthStart, to: monthEnd, page: '1', size: '20' });
    await expect(screen.fromInput).toHaveValue(toDisplayDate(monthStart));
    await expect(screen.toInput).toHaveValue(toDisplayDate(monthEnd));
  });

  // Khoang rong thi man an ca bang (khong co header) -> kiem cot o day, khi co du lieu.
  test('[RON-TIMEKEEP-002] Bang 3 cot hien dung du lieu API, dinh dang ngay/gio, moi nhat truoc, 1 dong/ngay (QD-04-02 muc 1.5)', async ({ api }) => {
    // Arrange
    const month = await latestMonthWithData(api);
    test.skip(!month, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}`);
    const { from, to, records } = month!;
    test.skip(records.length > 20, 'Thang co > 20 ban ghi, vuot 1 trang mac dinh');

    // Act
    await screen.goto({ page: 1, size: 20, from, to });
    const rows = await screen.tableRows();

    // Assert
    expect(await screen.columnHeaders()).toEqual(['Ngày', 'Thời gian checkin', 'Thời gian checkout']);
    expect(rows).toEqual(records.map(toRow));
    for (const row of rows) {
      expect(row.checkIn, `checkin ngay ${row.day}`).toMatch(HH_MM_SS);
      if (row.checkOut) expect(row.checkOut, `checkout ngay ${row.day}`).toMatch(HH_MM_SS);
    }
    const days = records.map((r) => r.day);
    expect(days, 'Sap xep ngay giam dan').toEqual([...days].sort().reverse());
    expect(new Set(days).size, 'Moi ngay chi 1 dong (check-in dau, check-out cuoi)').toBe(days.length);
    await expect(screen.pageInfo).toHaveText(`1-${records.length} trên ${records.length}`);
  });

  test('[RON-TIMEKEEP-003] Doi Tu ngay bang datepicker thi URL, API va bang loc theo ngay moi', async ({ api, employeePage }) => {
    // Arrange: thang co du lieu, chon "Tu ngay" = ngay giua (ban ghi thu 2 tu cu nhat) de bang it di
    const month = await latestMonthWithData(api);
    test.skip(!month || month.records.length < 2, 'Can thang co >= 2 ngay cham cong');
    const { from, to, records } = month!;
    const newFrom = records[records.length - 2].day;
    await screen.goto({ page: 1, size: 20, from, to });
    const apiCall = employeePage.waitForRequest((r) => r.url().includes('/api/workTime/checkIn') && r.url().includes(`from=${newFrom}`));

    // Act
    await screen.pickDayInShownMonth(screen.fromInput, Number(newFrom.slice(8, 10)));

    // Assert
    await apiCall;
    expect(screen.urlQuery()).toMatchObject({ from: newFrom, to });
    await expect(screen.fromInput).toHaveValue(toDisplayDate(newFrom));
    expect(await screen.tableRows()).toEqual(records.filter((r) => r.day >= newFrom).map(toRow));
  });

  test('[RON-TIMEKEEP-004] Datepicker khoa ngay ngoai khoang: Den ngay khoa truoc Tu ngay, Tu ngay khoa sau Den ngay', async () => {
    // Arrange: khoang 11 -> 20 trong thang hien tai (chi la bo loc, khong can du lieu)
    const month = todayInVietnam().slice(0, 7);
    const lastDay = Number(monthRange(todayInVietnam())[1].slice(8, 10));
    await screen.goto({ page: 1, size: 20, from: `${month}-11`, to: `${month}-20` });

    // Act + Assert: popup render cham khi mang toi ron-dev chap chon -> poll thay vi doc 1 lan
    await screen.openPicker(screen.toInput);
    await expect.poll(() => screen.disabledDaysInShownMonth()).toEqual(Array.from({ length: 10 }, (_, i) => i + 1)); // 1..10
    await screen.closePicker();
    await screen.openPicker(screen.fromInput);
    await expect
      .poll(() => screen.disabledDaysInShownMonth())
      .toEqual(Array.from({ length: lastDay - 20 }, (_, i) => i + 21)); // 21..cuoi thang
    await screen.closePicker();
  });

  test('[RON-TIMEKEEP-005] Khoang ngay khong co ban ghi thi hien "Khong co du lieu"', async ({ api }) => {
    // Arrange: thang sau (tuong lai) chac chan chua co cham cong
    const [from, to] = monthRange(shiftMonthStart(todayInVietnam(), 1));
    expect((await api.listMyCheckIns(from, to)).total, 'Thang tuong lai phai rong').toBe(0);

    // Act
    await screen.goto({ page: 1, size: 20, from, to });

    // Assert
    await expect(screen.page.getByText(NO_DATA_TEXT)).toBeVisible();
    await expect(screen.rows).toHaveCount(0);
  });

  // HANH VI HIEN TAI (doc 08 diem bat thuong 2): khoang nguoc tren URL khong bao loi (man 10 thi co).
  // Neu dev them validate -> doi assertion sang thong bao loi.
  test('[RON-TIMEKEEP-006] Khoang ngay nguoc tren URL thi khong loi, bang rong', async ({ api }) => {
    // Arrange: dao from/to cua thang co du lieu -> neu server loc sai se lo ra ban ghi
    const month = await latestMonthWithData(api);
    test.skip(!month, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}`);
    test.info().annotations.push({ type: 'known-behavior', description: 'Khoang ngay nguoc khong bao loi (doc 08 diem 2)' });

    // Act
    await screen.goto({ page: 1, size: 20, from: month!.to, to: month!.from });

    // Assert
    await expect(screen.page.getByText(NO_DATA_TEXT)).toBeVisible();
    await expect(screen.rows).toHaveCount(0);
    await expect(screen.page.locator('[role="alert"]').filter({ visible: true })).toHaveCount(0);
  });

  test('[RON-TIMEKEEP-007] Phan trang size=5: trang 1 hien 5 dong, bam trang sau hien 5 dong tiep theo', async ({ api }) => {
    // Arrange
    const to = todayInVietnam();
    const { results, total } = await api.listMyCheckIns(SEARCH_FROM, to);
    test.skip(total <= 5, `Can > 5 ban ghi cham cong de phan trang (co ${total})`);
    await screen.goto({ page: 1, size: 5, from: SEARCH_FROM, to });
    expect(await screen.tableRows()).toEqual(results.slice(0, 5).map(toRow));
    await expect(screen.pageInfo).toHaveText(`1-5 trên ${total}`);

    // Act
    await screen.waitForList(() => screen.nextPageButton().click());

    // Assert
    const pageTwoEnd = Math.min(10, total);
    expect(await screen.tableRows()).toEqual(results.slice(5, 10).map(toRow));
    await expect(screen.pageInfo).toHaveText(`6-${pageTwoEnd} trên ${total}`);
  });

  // Bao mat (doc 08 diem bat thuong 3): URL co san param `username`. Server phai bo qua param nay
  // va chi tra du lieu cua chinh user dang dang nhap (do 08/10: dang dung).
  test('[RON-TIMEKEEP-008] Param username cua nguoi khac bi bo qua, chi tra du lieu cua chinh minh (IDOR)', async ({ api }) => {
    // Arrange
    const to = todayInVietnam();
    const own = await api.listMyCheckIns(SEARCH_FROM, to);
    test.skip(own.total === 0, `Account test khong co du lieu cham cong tu ${SEARCH_FROM}, khong phan biet duoc`);

    // Act
    const withOtherUser = await api.listMyCheckIns(SEARCH_FROM, to, { username: OTHER_USERNAME });
    await screen.goto({ page: 1, size: 20, username: OTHER_USERNAME, from: SEARCH_FROM, to });

    // Assert
    expect(withOtherUser).toEqual(own);
    expect(new Set(withOtherUser.results.map((r) => r.userId)).size, 'Chi 1 userId (chinh minh)').toBe(1);
    expect(await screen.tableRows()).toEqual(own.results.slice(0, 20).map(toRow));
  });
});
