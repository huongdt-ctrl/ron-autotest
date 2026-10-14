import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import {
  expectedRow,
  NO_DATA_TEXT,
  REQUEST_LIST_PATH,
  toDisplayDate,
  WorkTimeRequestListPage,
} from '../../pages/work-time-request-list-page';
import { monthRange, todayInVietnam } from '../../utils/working-days';

// Man "Don dang ky" (doc 04) - danh sach + bo loc. CHI DOC (writeGuard chan moi request ghi).
// Du lieu don cua account test thay doi theo lan chay -> lay API danh sach cung query lam oracle cho UI.

test.describe('Don dang ky - danh sach va bo loc', () => {
  let screen: WorkTimeRequestListPage;
  const [monthStart, monthEnd] = monthRange(todayInVietnam());
  const year = todayInVietnam().slice(0, 4);

  test.beforeEach(async ({ employeePage }) => {
    screen = new WorkTimeRequestListPage(employeePage);
  });

  test('[RON-REQLIST-001] Mo tu sidebar thi mac dinh loc thang hien tai, moi loai, moi trang thai, 20 dong @smoke', async ({ employeePage }) => {
    // Arrange
    const sidebar = new AppSidebarPage(employeePage);
    await employeePage.goto('/');
    await sidebar.expandAll();

    // Act
    const apiUrl = await screen.waitForList(() => sidebar.nav.locator(`a[href="${REQUEST_LIST_PATH}"]`).click());

    // Assert
    expect(screen.urlQuery()).toEqual({ page: '1', size: '20', type: 'null', status: 'null', from: monthStart, to: monthEnd });
    expect(Object.fromEntries(apiUrl.searchParams)).toEqual({ page: '1', size: '20', from: monthStart, to: monthEnd });
    await expect(screen.fromInput).toHaveValue(toDisplayDate(monthStart));
    await expect(screen.toInput).toHaveValue(toDisplayDate(monthEnd));
  });

  test('[RON-REQLIST-002] Bang 6 cot hien dung du lieu API va thong tin phan trang', async ({ api }) => {
    // Arrange
    const query = { page: 1, size: 20, from: monthStart, to: monthEnd };
    const expected = await api.searchMyRequests(query);
    test.skip(expected.total === 0, 'Account test khong co don nao trong thang hien tai');

    // Act
    await screen.goto({ ...query, type: 'null', status: 'null' });

    // Assert
    expect(await screen.columnHeaders()).toEqual(['Thời gian đăng ký', 'Lí do', 'Người kiểm duyệt', 'Loại đơn', 'Trạng thái', 'Tùy chỉnh']);
    expect(await screen.tableRows()).toEqual(expected.results.map(expectedRow));
    await expect(screen.pageInfo).toHaveText(`1-${expected.results.length} trên ${expected.total}`);
  });

  test('[RON-REQLIST-003] Loc Loai don = OT thi URL va API co type=OT, bang chi con don OT', async ({ api }) => {
    // Arrange
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: `${year}-01-01`, to: `${year}-12-31` });
    expect(await screen.filterOptions('type')).toEqual(['Tất cả', 'Nghỉ phép', 'Remote', 'OT']);
    const expected = await api.searchMyRequests({ page: 1, size: 20, from: `${year}-01-01`, to: `${year}-12-31`, type: 'OT' });

    // Act
    const apiUrl = await screen.selectFilter('type', 'OT');

    // Assert
    expect(screen.urlQuery().type).toBe('OT');
    expect(apiUrl.searchParams.get('type')).toBe('OT');
    expect(await screen.tableRows()).toEqual(expected.results.map(expectedRow));
  });

  test('[RON-REQLIST-004] Loc Trang thai = Chap thuan thi URL status=APPROVED, bang chi con don Chap thuan', async ({ api }) => {
    // Arrange
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: `${year}-01-01`, to: `${year}-12-31` });
    expect(await screen.filterOptions('status')).toEqual(['Tất cả', 'Chấp thuận', 'Chờ xử lý', 'Chờ xác nhận', 'Từ chối', 'Hủy']);
    const expected = await api.searchMyRequests({ page: 1, size: 20, from: `${year}-01-01`, to: `${year}-12-31`, status: 'APPROVED' });

    // Act
    const apiUrl = await screen.selectFilter('status', 'Chấp thuận');

    // Assert
    expect(screen.urlQuery().status).toBe('APPROVED');
    expect(apiUrl.searchParams.get('status')).toBe('APPROVED');
    const rows = await screen.tableRows();
    expect(rows).toEqual(expected.results.map(expectedRow));
    for (const row of rows) expect(row.status).toBe('Chấp thuận');
  });

  test('[RON-REQLIST-005] Doi so dong 50 / trang thi URL va API size=50, phan trang cap nhat', async ({ api }) => {
    // Arrange
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: `${year}-01-01`, to: `${year}-12-31` });
    expect(await screen.filterOptions('size')).toEqual(['20 / trang', '50 / trang', '100 / trang']);
    const expected = await api.searchMyRequests({ page: 1, size: 50, from: `${year}-01-01`, to: `${year}-12-31` });

    // Act
    const apiUrl = await screen.selectFilter('size', '50 / trang');

    // Assert
    expect(screen.urlQuery().size).toBe('50');
    expect(apiUrl.searchParams.get('size')).toBe('50');
    await expect(screen.rows).toHaveCount(expected.results.length);
    await expect(screen.pageInfo).toHaveText(`1-${expected.results.length} trên ${expected.total}`);
  });

  test('[RON-REQLIST-006] Datepicker Tu ngay khoa ngay sau Den ngay, Den ngay khoa ngay truoc Tu ngay', async () => {
    // Arrange: khoang 10 -> 20 cua thang hien tai
    const month = monthStart.slice(0, 7);
    const lastDay = Number(monthEnd.slice(8, 10));
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: `${month}-10`, to: `${month}-20` });

    // Act
    await screen.openPicker(screen.fromInput);
    const disabledInFrom = await screen.disabledDaysInShownMonth();
    await screen.closePicker();
    await screen.openPicker(screen.toInput);
    const disabledInTo = await screen.disabledDaysInShownMonth();
    await screen.closePicker();

    // Assert
    expect(disabledInFrom).toEqual(Array.from({ length: lastDay - 20 }, (_, i) => 21 + i));
    expect(disabledInTo).toEqual(Array.from({ length: 9 }, (_, i) => 1 + i));
  });

  // Doc 04 diem bat thuong 8: khoang nguoc khong bao loi (man Don dang ky cham cong thi bao loi).
  // Test ghi lai HANH VI HIEN TAI; neu dev them validate thi doi assertion.
  test('[RON-REQLIST-007] Sua URL thanh khoang ngay nguoc thi API van duoc goi, bang hien Khong co du lieu', async ({ employeePage }) => {
    // Arrange
    const reversed = { from: monthEnd, to: monthStart };

    // Act
    const apiUrl = await screen.waitForList(() =>
      employeePage.goto(`${REQUEST_LIST_PATH}?page=1&size=20&type=null&status=null&from=${reversed.from}&to=${reversed.to}`),
    );

    // Assert
    expect(apiUrl.searchParams.get('from')).toBe(reversed.from);
    expect(apiUrl.searchParams.get('to')).toBe(reversed.to);
    await expect(employeePage.getByText(NO_DATA_TEXT)).toBeVisible();
    await expect(screen.rows).toHaveCount(0);
  });

  // BUG da biet (doc 04 diem bat thuong 9): xoa trang "Den ngay" -> URL to=null, API khong con `to`,
  // nhung o van hien ngay cu -> UI va du lieu lech nhau. Dev sua -> doi assertion theo cach xu ly moi.
  test('[RON-REQLIST-014] BUG da biet: xoa trang Den ngay thi URL to=null, API bo to nhung o van hien ngay cu', async () => {
    test.info().annotations.push({ type: 'known-bug', description: 'Xoa Den ngay: o hien ngay cu, API loc khong co to' });

    // Arrange
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: monthStart, to: monthEnd });
    await screen.toInput.click({ force: true });

    // Act
    const apiUrl = await screen.waitForList(async () => {
      await screen.toInput.press('ControlOrMeta+a');
      await screen.toInput.press('Backspace');
      await screen.toInput.press('Enter');
    });

    // Assert (hanh vi bug)
    expect(screen.urlQuery().to).toBe('null');
    expect(apiUrl.searchParams.has('to')).toBe(false);
    expect(apiUrl.searchParams.get('from')).toBe(monthStart);
    await expect(screen.toInput).toHaveValue(toDisplayDate(monthEnd));
  });
});
