import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppHeaderPage, HEADER_LABELS } from '../../pages/app-header-page';

// Header chung (doc 12) - phan bo cuc + nut "Cham cong remote".
// ⚠️ KHONG click nut "Cham cong remote" (cham cong that, khong xac nhan - thoa thuan doc 12).
// Rule QD-04-02 muc 3.5 (chan cham cong khi khong co don remote da duyet, cat gio tai khung dang ky)
// can account test rieng + cho phep tao du lieu cham cong -> chua tu dong hoa.

/** Moi man trong menu nhan vien (doc 13) deu phai co header. */
const EMPLOYEE_ROUTES = [
  '/',
  '/profile',
  '/work-time-management',
  '/user-timekeeping-list',
  '/monthly-working-hours',
  '/check-in-register',
  '/team-management',
];

test.describe('Header - bo cuc va nut Cham cong remote', () => {
  let header: AppHeaderPage;

  test.beforeEach(async ({ employeePage }) => {
    header = new AppHeaderPage(employeePage);
  });

  test('[RON-HDR-001] Header co logo, nut "Cham cong remote" va dropdown ngon ngu mac dinh Tieng Viet @smoke', async ({ employeePage }) => {
    // Act
    await employeePage.goto('/work-time-management');

    // Assert
    await expect(header.logo.locator('img[alt="logo"]')).toBeVisible();
    await expect(header.remoteCheckInButton).toBeVisible();
    await expect(header.remoteCheckInButton).toHaveText(HEADER_LABELS.vi.remoteCheckIn);
    await expect(header.remoteCheckInButton).toBeEnabled();
    await expect(header.languageValue).toHaveText(HEADER_LABELS.vi.selected);
    expect(await header.storedLanguage()).toBe('vi');
  });

  for (const route of EMPLOYEE_ROUTES) {
    test(`[RON-HDR-002] Man ${route} co du header: logo, nut cham cong remote, dropdown ngon ngu`, async ({ employeePage }) => {
      // Act
      await employeePage.goto(route);

      // Assert
      await expect(header.logo).toBeVisible();
      await expect(header.remoteCheckInButton).toBeVisible();
      await expect(header.languageControl).toBeVisible();
    });
  }

  test('[RON-HDR-003] Bam logo thi ve Trang chu "/"', async ({ employeePage }) => {
    // Arrange
    await employeePage.goto('/monthly-working-hours');

    // Act
    await header.logo.click();

    // Assert
    await expect(employeePage).toHaveURL((url) => url.pathname === '/');
    await expect(header.remoteCheckInButton).toBeVisible();
  });

  test('[RON-HDR-004] Hover nut "Cham cong remote" khong hien tooltip va khong goi API nao', async ({ employeePage }) => {
    // Arrange: ghi lai moi request /api/ trong luc hover
    await employeePage.goto('/work-time-management');
    await employeePage.waitForLoadState('networkidle');
    const apiCalls: string[] = [];
    const onRequest = (r: import('@playwright/test').Request) => {
      const path = new URL(r.url()).pathname;
      if (path.startsWith('/api/')) apiCalls.push(`${r.method()} ${path}`);
    };
    employeePage.on('request', onRequest);

    // Act
    await header.remoteCheckInButton.hover();
    await employeePage.waitForTimeout(1_000); // tooltip/request (neu co) thuong xuat hien sau ~300-500ms
    employeePage.off('request', onRequest);

    // Assert
    expect(apiCalls).toEqual([]);
    await expect(employeePage.getByRole('tooltip')).toHaveCount(0);
    await expect(header.remoteCheckInButton).not.toHaveAttribute('title');
  });
});
