import { expect, TBP_USERNAME, test } from '../../fixtures/approver-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import { APPROVE_LIST_COLUMNS, APPROVE_LIST_PATH, ApproveRequestListPage, expectedApproveRow } from '../../pages/approve-request-list-page';
import { toDisplayDate } from '../../pages/work-time-request-list-page';
import { monthRange, todayInVietnam } from '../../utils/working-days';

// Man "Phe duyet don" (doc 14), role TBP - danh sach + bo loc. CHI DOC: khong tao, khong duyet don.
// Oracle cua bang = API /api/workTimeRegisters/assigned voi dung query man da gui.

test.describe('Phe duyet don (TBP) - danh sach va bo loc', () => {
  test.skip(!TBP_USERNAME || !process.env.RON_TBP_PASSWORD, 'Chua set RON_TBP_USERNAME / RON_TBP_PASSWORD trong .env');

  let screen: ApproveRequestListPage;

  test.beforeEach(async ({ approverPage }) => {
    screen = new ApproveRequestListPage(approverPage);
  });

  test('[RON-APPROVE-001] TBP co menu Phe duyet don; mo man mac dinh loc Tat ca, thang hien tai @smoke', async ({ approverPage }) => {
    // Arrange
    const [monthStart, monthEnd] = monthRange(todayInVietnam());
    await approverPage.goto('/');
    const sidebar = new AppSidebarPage(approverPage);
    await sidebar.expandAll();

    // Act
    const hrefs = await sidebar.menuHrefs();
    const apiUrl = await screen.waitForList(() => approverPage.locator(`a[href="${APPROVE_LIST_PATH}"]`).first().click());

    // Assert
    expect(hrefs).toContain(APPROVE_LIST_PATH);
    expect(screen.urlQuery()).toEqual({ page: '1', size: '20', type: 'null', status: 'null', from: monthStart, to: monthEnd });
    // type/status = null tren URL thi API bo han 2 tham so nay (do 2026-10-12)
    expect(Object.fromEntries(apiUrl.searchParams)).toEqual({ page: '1', size: '20', from: monthStart, to: monthEnd });
    await expect(screen.fromInput).toHaveValue(toDisplayDate(monthStart));
    await expect(screen.toInput).toHaveValue(toDisplayDate(monthEnd));
  });

  test('[RON-APPROVE-002] Option bo loc Loai don va Trang thai dung nhu doc 14', async () => {
    // Arrange
    await screen.goto();

    // Act
    const types = await screen.filterOptions('type');
    const statuses = await screen.filterOptions('status');

    // Assert
    expect(types).toEqual(['Tất cả', 'Nghỉ phép', 'Remote', 'OT']);
    expect(statuses).toEqual(['Tất cả', 'Chấp thuận', 'Chờ xử lý', 'Chờ xác nhận', 'Từ chối', 'Hủy']);
  });

  test('[RON-APPROVE-003] Bang thang hien tai khop API assigned (cot, thu tu, noi dung)', async ({ approverApi }) => {
    // Arrange + Act
    const apiUrl = await screen.goto();
    const oracle = await approverApi.searchAssignedRequests(Object.fromEntries(apiUrl.searchParams));

    // Assert
    test.skip(oracle.results.length === 0, 'TBP khong co don nao duoc giao trong thang hien tai');
    expect(await screen.columnHeaders()).toEqual(APPROVE_LIST_COLUMNS);
    expect(await screen.tableRows()).toEqual(oracle.results.map(expectedApproveRow));
  });

  test('[RON-APPROVE-004] Loc Nghi phep + Tu choi: gui type/status len API, bang chi con dong khop', async ({ approverApi }) => {
    // Arrange
    await screen.goto();

    // Act
    await screen.selectFilter('type', 'Nghỉ phép');
    const apiUrl = await screen.selectFilter('status', 'Từ chối');

    // Assert: query URL man + API
    const query = screen.urlQuery();
    expect(query.type).not.toBe('null');
    expect(query.status).not.toBe('null');
    expect(apiUrl.searchParams.get('type')).toBe(query.type);
    expect(apiUrl.searchParams.get('status')).toBe(query.status);
    // Assert: bang = oracle, moi dong dung loai + trang thai
    const oracle = await approverApi.searchAssignedRequests(Object.fromEntries(apiUrl.searchParams));
    const rows = await screen.tableRows();
    expect(rows).toEqual(oracle.results.map(expectedApproveRow));
    for (const row of rows) expect(row).toMatchObject({ type: 'Nghỉ phép', status: 'Từ chối' });
  });
});
