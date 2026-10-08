import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';

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
});
