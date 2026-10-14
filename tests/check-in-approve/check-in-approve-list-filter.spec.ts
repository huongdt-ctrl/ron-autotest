import { expect, TBP_USERNAME, test } from '../../fixtures/approver-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import {
  CHECK_IN_APPROVE_COLUMNS,
  CHECK_IN_APPROVE_PATH,
  CheckInApproveListPage,
  expectedCheckInApproveRow,
} from '../../pages/check-in-approve-list-page';
import { STATUS_LABELS, toDisplayDate } from '../../pages/work-time-request-list-page';
import { monthRange, todayInVietnam } from '../../utils/working-days';

// Man "Phe duyet don cham cong" (doc 15), role TBP - danh sach + bo loc. CHI DOC: khong tao, khong duyet don.
// Oracle cua bang = API /api/workTime/checkInRegisters/assigned voi dung query man da gui.

const EMPLOYEE_USERNAME = process.env.RON_USERNAME || '';

test.describe('Phe duyet don cham cong (TBP) - danh sach va bo loc', () => {
  test.skip(!TBP_USERNAME || !process.env.RON_TBP_PASSWORD, 'Chua set RON_TBP_USERNAME / RON_TBP_PASSWORD trong .env');

  let screen: CheckInApproveListPage;

  test.beforeEach(async ({ approverPage }) => {
    screen = new CheckInApproveListPage(approverPage);
  });

  test('[RON-CHECKIN-APPROVE-001] TBP co menu Phe duyet don cham cong; mo man mac dinh thang hien tai, khong loc @smoke', async ({
    approverPage,
  }) => {
    // Arrange
    const [monthStart, monthEnd] = monthRange(todayInVietnam());
    await approverPage.goto('/');
    const sidebar = new AppSidebarPage(approverPage);
    await sidebar.expandAll();

    // Act
    const hrefs = await sidebar.menuHrefs();
    const apiUrl = await screen.waitForList(() => approverPage.locator(`a[href="${CHECK_IN_APPROVE_PATH}"]`).first().click());

    // Assert
    expect(hrefs).toContain(CHECK_IN_APPROVE_PATH);
    expect(screen.urlQuery()).toEqual({ page: '1', size: '20', from: monthStart, to: monthEnd, status: 'null', username: 'null' });
    // status/username = null tren URL thi API bo han 2 tham so nay (do 2026-10-13)
    expect(Object.fromEntries(apiUrl.searchParams)).toEqual({ page: '1', size: '20', from: monthStart, to: monthEnd });
    await expect(screen.usernameInput).toHaveValue('');
    await expect(screen.fromInput).toHaveValue(toDisplayDate(monthStart));
    await expect(screen.toInput).toHaveValue(toDisplayDate(monthEnd));
  });

  test('[RON-CHECKIN-APPROVE-002] Option bo loc Trang thai va So dong dung nhu doc 15', async ({ approverApi }) => {
    // Arrange: combobox So dong chi hien khi bang co du lieu
    const apiUrl = await screen.goto();
    const { total } = await approverApi.searchAssignedCheckInRegisters(Object.fromEntries(apiUrl.searchParams));

    // Act
    const statuses = await screen.filterOptions('status');
    const sizes = total > 0 ? await screen.filterOptions('size') : null;

    // Assert
    expect(statuses).toEqual(['Tất cả', 'Chấp thuận', 'Chờ xử lý', 'Chờ xác nhận', 'Từ chối', 'Hủy']);
    if (sizes) expect(sizes).toEqual(['20 / trang', '50 / trang', '100 / trang']);
  });

  test('[RON-CHECKIN-APPROVE-003] Bang thang hien tai khop API assigned (cot, thu tu, noi dung)', async ({ approverApi }) => {
    // Arrange + Act
    const apiUrl = await screen.goto();
    const oracle = await approverApi.searchAssignedCheckInRegisters(Object.fromEntries(apiUrl.searchParams));

    // Assert
    test.skip(oracle.results.length === 0, 'TBP khong co don cham cong nao duoc giao trong thang hien tai');
    expect(await screen.columnHeaders()).toEqual(CHECK_IN_APPROVE_COLUMNS);
    expect(await screen.tableRows()).toEqual(oracle.results.map(expectedCheckInApproveRow));
  });

  test('[RON-CHECKIN-APPROVE-004] Loc tai khoan + Cho xu ly: gui username/status len API, bang chi con dong khop', async ({
    approverApi,
  }) => {
    test.skip(!EMPLOYEE_USERNAME, 'Chua set RON_USERNAME trong .env');
    // Arrange
    await screen.goto();

    // Act
    await screen.filterUsername(EMPLOYEE_USERNAME);
    const apiUrl = await screen.selectFilter('status', STATUS_LABELS.PENDING);

    // Assert: query URL man + API
    expect(screen.urlQuery()).toMatchObject({ username: EMPLOYEE_USERNAME, status: 'PENDING' });
    expect(apiUrl.searchParams.get('username')).toBe(EMPLOYEE_USERNAME);
    expect(apiUrl.searchParams.get('status')).toBe('PENDING');
    // Assert: bang = oracle, moi dong dung nguoi dang ky + trang thai
    const oracle = await approverApi.searchAssignedCheckInRegisters(Object.fromEntries(apiUrl.searchParams));
    const rows = await screen.tableRows();
    expect(rows).toEqual(oracle.results.map(expectedCheckInApproveRow));
    for (const row of rows) expect(row).toMatchObject({ requester: EMPLOYEE_USERNAME, status: STATUS_LABELS.PENDING });
  });
});
