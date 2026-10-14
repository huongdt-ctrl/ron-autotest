import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import { todayInVietnam } from '../../utils/working-days';

// Phan quyen cua account nhan vien (RON_USERNAME, khong co vai tro dac biet) - doc 13.
// CHI DOC: mo URL truc tiep, khong bam nut nao tren man quan tri (writeGuard chan moi request ghi).

const EMPLOYEE_MENU = [
  '/',
  '/work-time-management',
  '/user-timekeeping-list',
  '/monthly-working-hours',
  '/check-in-register',
  '/team-management',
];

/** Man quan tri backend chan nhan vien (FORBIDDEN tra HTTP 200) -> toast. */
const BLOCKED_ADMIN_ROUTES = [
  '/application-management',
  '/check-in-register-management',
  '/timekeeping-management',
  '/user-management',
  '/holiday-management',
];

const ACCESS_DENIED = 'Không có quyền truy cập!';

test.describe('Phan quyen - account nhan vien', () => {
  test('[RON-PERM-001] Menu nhan vien chi co 6 man, khong co Phe duyet don / Phe duyet don cham cong @smoke', async ({ employeePage }) => {
    // Arrange
    const sidebar = new AppSidebarPage(employeePage);
    await employeePage.goto('/');

    // Act
    await sidebar.expandAll();

    // Assert
    expect(await sidebar.menuHrefs()).toEqual(EMPLOYEE_MENU);
  });

  for (const route of BLOCKED_ADMIN_ROUTES) {
    test(`[RON-PERM-002] Mo truc tiep ${route} thi bao "${ACCESS_DENIED}"`, async ({ employeePage }) => {
      // Act
      await employeePage.goto(route);

      // Assert
      await expect(employeePage.getByText(ACCESS_DENIED).first()).toBeVisible();
    });
  }

  test('[RON-PERM-003] Route khong ton tai thi hien trang 404 co nut Ve Trang Chu', async ({ employeePage }) => {
    // Act
    await employeePage.goto('/autotest-route-khong-ton-tai');

    // Assert
    await expect(employeePage.getByText('Không thể hiển thị trang')).toBeVisible();
    await expect(employeePage.getByText('Trang bạn đang tìm kiếm không có sẵn!')).toBeVisible();
    await expect(employeePage.getByRole('link', { name: 'Về Trang Chủ' })).toBeVisible();
  });

  // BUG da biet (2026-10-07, doc 13 diem bat thuong 1): nhan vien xem duoc du lieu cap cong ty.
  // Test ghi lai HANH VI HIEN TAI; khi dev chan -> doi assertion thanh: hien toast ACCESS_DENIED, khong co dong.
  for (const route of ['/company-management', '/special-leave-management']) {
    test(`[RON-PERM-004] BUG da biet: nhan vien mo ${route} van thay du lieu`, async ({ employeePage }) => {
      test.info().annotations.push({ type: 'known-bug', description: `Nhan vien xem duoc du lieu quan tri o ${route}` });

      // Act
      await employeePage.goto(route);

      // Assert (hanh vi bug)
      await expect(employeePage.locator('tbody tr').first()).toBeVisible();
      await expect(employeePage.getByText(ACCESS_DENIED)).toHaveCount(0);
    });
  }

  // Doc 13: 2 man phe duyet khong co tren menu nhan vien nhung mo bang URL duoc, danh sach rong
  // (khong ai giao don cho nhan vien), khong bao loi quyen.
  for (const [route, api, title] of [
    ['/approve-management', '/api/workTimeRegisters/assigned', 'Phê duyệt đơn'],
    ['/check-in-register-approve', '/api/workTime/checkInRegisters/assigned', 'Phê duyệt đơn chấm công'],
  ] as const) {
    test(`[RON-PERM-005] Nhan vien mo truc tiep ${route} thi vao duoc, danh sach rong, khong bao loi quyen`, async ({ employeePage }) => {
      // Arrange
      const response = employeePage.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === api);

      // Act
      await employeePage.goto(route);
      const body = await (await response).json();

      // Assert
      expect(body).toMatchObject({ error: null, data: { total: 0 } });
      await expect(employeePage.getByText(title, { exact: true }).first()).toBeVisible();
      await expect(employeePage.locator('tbody tr')).toHaveCount(0);
      await expect(employeePage.getByText(ACCESS_DENIED)).toHaveCount(0);
    });
  }

  // BUG da biet (doc 13 diem bat thuong 1): man Xuat bang cham cong toan cong ty mo duoc bang URL.
  // KHONG bam "Xuat bang" (tai du lieu nhan su that). Dev chan -> doi assertion: toast ACCESS_DENIED, khong co nut.
  test('[RON-PERM-006] BUG da biet: nhan vien mo /export-table-timekeeping van thay nut Xuat bang', async ({ employeePage }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Nhan vien mo duoc man Xuat bang cham cong cua cong ty' });

    // Act
    await employeePage.goto('/export-table-timekeeping');

    // Assert (hanh vi bug)
    await expect(employeePage.getByText('Xuất bảng chấm công', { exact: true }).first()).toBeVisible();
    await expect(employeePage.getByRole('button', { name: 'Xuất bảng', exact: true })).toBeEnabled();
    await expect(employeePage.getByText(ACCESS_DENIED)).toHaveCount(0);
  });

  // Doc 13 diem bat thuong 2 (IDOR): man admin gio cong thang mo duoc, nhung backend chan xem gio cong
  // nguoi khac (FORBIDDEN, do 2026-10-13). Bang van hien gio cong cua CHINH MINH (frontend khong co route guard).
  test('[RON-PERM-007] /monthly-working-hours-admin: bao loi quyen, chi hien gio cong cua minh, API chan username khac', async ({ employeePage, api }) => {
    // Arrange
    const [year, month] = todayInVietnam().split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const me = (await api.userInfo()).username;
    const other = (await api.approvalUsers()).find((u) => u.username !== me)?.username;
    expect(other, 'Can 1 username khac de kiem tra IDOR').toBeDefined();
    const toastShown = employeePage.locator('.Toastify__toast').filter({ hasText: ACCESS_DENIED }).first().waitFor().then(() => true, () => false);

    // Act
    await employeePage.goto('/monthly-working-hours-admin');

    // Assert: UI
    expect(await toastShown, `Toast "${ACCESS_DENIED}"`).toBe(true);
    await expect(employeePage.locator('tbody tr')).toHaveCount(daysInMonth);

    // Assert: API - danh sach username va gio cong nguoi khac bi chan
    expect(await api.errorCodeOfGet('/api/work-time/monthly/list-username')).toBe('FORBIDDEN');
    expect(await api.errorCodeOfGet(`/api/work-time/monthly?page=1&size=20&year=${year}&month=${month}&username=${other}`)).toBe('FORBIDDEN');
  });
});
