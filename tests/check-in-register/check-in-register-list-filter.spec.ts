import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import {
  CHECK_IN_LIST_COLUMNS,
  CHECK_IN_LIST_PATH,
  CheckInRegisterListPage,
  expectedCheckInRow,
} from '../../pages/check-in-register-list-page';
import { NO_DATA_TEXT } from '../../pages/work-time-request-list-page';
import { monthRange, todayInVietnam } from '../../utils/working-days';

// Man "Don dang ky cham cong" (doc 10) - danh sach + bo loc. CHI DOC (writeGuard chan moi request ghi).
// Du lieu don cua account test thay doi theo lan chay -> lay API danh sach cung query lam oracle cho UI.

const REVERSED_RANGE_TOAST = 'Vui lòng kiểm tra lại tham số API!';

test.describe('Don cham cong - danh sach va bo loc', () => {
  let screen: CheckInRegisterListPage;
  const [monthStart, monthEnd] = monthRange(todayInVietnam());
  const year = todayInVietnam().slice(0, 4);

  test.beforeEach(async ({ employeePage }) => {
    screen = new CheckInRegisterListPage(employeePage);
  });

  test('[RON-CHECKIN-201] Mo tu sidebar Cham cong thi mac dinh loc thang hien tai, 20 dong, du 8 cot @smoke', async ({ employeePage }) => {
    // Arrange
    const sidebar = new AppSidebarPage(employeePage);
    await employeePage.goto('/');
    await sidebar.expandAll();
    const response = employeePage.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/workTime/checkInRegisters',
    );

    // Act
    await sidebar.nav.locator(`a[href="${CHECK_IN_LIST_PATH}"]`).click();
    const apiUrl = new URL((await response).url());

    // Assert
    expect(screen.urlQuery()).toEqual({ page: '1', size: '20', from: monthStart, to: monthEnd });
    expect(Object.fromEntries(apiUrl.searchParams)).toEqual({ page: '1', size: '20', from: monthStart, to: monthEnd });
    expect(await screen.columnHeaders()).toEqual(CHECK_IN_LIST_COLUMNS);
  });

  test('[RON-CHECKIN-202] Bang hien dung du lieu API (ngay yyyy-MM-dd, gio HH:mm, hinh thuc, trang thai) va phan trang', async ({ api }) => {
    // Arrange: lay ca nam de chac co du lieu
    const query = { page: 1, size: 20, from: `${year}-01-01`, to: `${year}-12-31` };
    const expected = await api.searchMyCheckInRegisters(query);
    test.skip(expected.total === 0, `Account test khong co don cham cong nao nam ${year}`);

    // Act
    await screen.goto(query);

    // Assert: server chi sap theo ngay (moi nhat truoc); cac don cung ngay doi thu tu giua 2 lan goi
    // -> so thu tu ngay, con noi dung dong so khong phu thuoc thu tu.
    const rows = await screen.tableRows();
    const expectedRows = expected.results.map(expectedCheckInRow);
    const byContent = (a: object, b: object) => JSON.stringify(a).localeCompare(JSON.stringify(b));
    expect(rows.map((r) => r.day)).toEqual(expectedRows.map((r) => r.day));
    expect([...rows].sort(byContent)).toEqual([...expectedRows].sort(byContent));
    await expect(screen.pageInfo).toHaveText(`1-${expected.results.length} trên ${expected.total}`);
  });

  // Doc 10 diem bat thuong 5: khoang nguoc hien toast ky thuat, trong khi man 04 / 08 im lang tra rong.
  // Test ghi lai HANH VI HIEN TAI; dev doi message / thong nhat cach xu ly -> doi assertion.
  test('[RON-CHECKIN-203] Khoang ngay nguoc tren URL thi bao "Vui long kiem tra lai tham so API!" va bang rong', async ({ employeePage }) => {
    test.info().annotations.push({ type: 'known-issue', description: 'Message ky thuat, khong nhat quan voi man 04/08 (doc 10 diem bat thuong 5)' });

    // Arrange: toast tu tat -> cho truoc khi dieu huong
    const toastShown = screen.toast(REVERSED_RANGE_TOAST).waitFor().then(() => true, () => false);

    // Act
    const apiUrl = await screen.goto({ page: 1, size: 20, from: monthEnd, to: monthStart });

    // Assert
    expect(apiUrl.searchParams.get('from')).toBe(monthEnd);
    expect(apiUrl.searchParams.get('to')).toBe(monthStart);
    expect(await toastShown, `Toast "${REVERSED_RANGE_TOAST}"`).toBe(true);
    await expect(screen.rows).toHaveCount(0);
    await expect(employeePage.getByText(NO_DATA_TEXT)).toBeVisible();
  });
});
