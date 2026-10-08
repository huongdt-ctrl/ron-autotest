import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';

// Dang xuat (doc 01). Dang xuat xoa phien cua trinh duyet dung chung -> test sau dung
// employeePage se tu dang nhap lai (ensureLoggedIn kiem tra localStorage.token).

test.describe('Dang xuat', () => {
  let sidebar: AppSidebarPage;

  test.beforeEach(async ({ employeePage }) => {
    sidebar = new AppSidebarPage(employeePage);
    await employeePage.goto('/work-time-management');
    await sidebar.openLogoutPopup();
  });

  // Ket thuc khi trang login da render xong: neu SPA con dang redirect, page.goto cua test ke tiep
  // bi cat ngang (net::ERR_ABORTED) - do 08/10.
  test.afterEach(async ({ employeePage }) => {
    if (/\/login/.test(employeePage.url())) await expect(employeePage.locator('input[name="username"]')).toBeVisible();
  });

  test('[RON-LOGOUT-001] Bam huy o popup dang xuat thi o lai man hien tai, van con phien', async ({ employeePage }) => {
    // Act
    await sidebar.cancelLogout();

    // Assert
    await expect(sidebar.logoutPopup).toBeHidden();
    await expect(employeePage).toHaveURL(/\/work-time-management/);
    expect(await employeePage.evaluate(() => !!localStorage.getItem('token'))).toBe(true);
  });

  test('[RON-LOGOUT-002] Xac nhan dang xuat thi ve trang login va xoa token o client @smoke', async ({ employeePage }) => {
    // Arrange: ghi lai moi request API trong luc dang xuat
    const apiCalls: string[] = [];
    const onRequest = (r: import('@playwright/test').Request) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
    };
    employeePage.on('request', onRequest);

    // Act
    await sidebar.confirmLogout();
    await employeePage.waitForURL(/\/login/);
    employeePage.off('request', onRequest);

    // Assert
    const storageKeys = await employeePage.evaluate(() => Object.keys(localStorage));
    expect(storageKeys).not.toContain('token');
    expect(storageKeys).not.toContain('refreshToken');
    expect(storageKeys).not.toContain('userInfo');
    // Hanh vi hien tai (doc 01, diem bat thuong): khong goi API thu hoi token o server.
    expect(apiCalls.filter((c) => c.startsWith('POST'))).toEqual([]);
  });

  test('[RON-LOGOUT-003] Sau khi dang xuat, mo route can dang nhap thi bi chuyen ve login', async ({ employeePage }) => {
    // Arrange
    await sidebar.confirmLogout();
    await employeePage.waitForURL(/\/login/);

    // Act
    await employeePage.goto('/work-time-management');

    // Assert
    await expect(employeePage).toHaveURL(/\/login/);
  });
});
