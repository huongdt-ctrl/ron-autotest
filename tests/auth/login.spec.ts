import { expect, test } from '../../fixtures/shared-page-fixture';
import { LoginPage } from '../../pages/login-page';

// LUU Y: nut "Cham cong remote" o header cham cong NGAY khi click, khong xac nhan.
// Test KHONG duoc click nut nay (tranh tao du lieu cham cong that cho account test).

test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('[RON-LOGIN-001] Bo trong ca 2 truong thi hien loi bat buoc @smoke', async () => {
    await loginPage.submitButton.click();

    await expect(loginPage.message('Vui lòng nhập tài khoản của bạn!')).toBeVisible();
    await expect(loginPage.message('Vui lòng nhập mật khẩu của bạn!')).toBeVisible();
  });

  test('[RON-LOGIN-002] Sai tai khoan/mat khau thi o lai trang login va bao loi @smoke', async ({ page }) => {
    await loginPage.login('autotest_nonexistent_user', 'WrongPass#123');

    await expect(loginPage.message('Vui lòng kiểm tra lại tài khoản/mật khẩu của bạn!')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('[RON-LOGIN-003] Dang nhap dung thi vao he thong @smoke', async ({ page }) => {
    const username = process.env.RON_USERNAME;
    const password = process.env.RON_PASSWORD;
    test.skip(!username || !password, 'Chua set RON_USERNAME / RON_PASSWORD trong .env');

    await loginPage.login(username!, password!);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(loginPage.usernameInput).toBeHidden();
  });
});
