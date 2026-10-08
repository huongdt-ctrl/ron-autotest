import { expect, type Locator, type Page } from '@playwright/test';

/** Page Object cho man hinh /login cua RON. */
export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Đăng nhập' });
    this.usernameInput = page.locator('input[name="username"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.getByRole('button', { name: 'Đăng nhập' });
  }

  /** Mo /login o trang thai sach: xoa phien dang nhap cua case truoc (trinh duyet dung chung). */
  async goto() {
    await this.page.context().clearCookies();
    // Ngay sau dang xuat, app con tu dieu huong/reload ve /login -> goto bi cat ngang (ERR_ABORTED)
    // hoac evaluate mat context. Chi 2 loi do navigation chen ngang moi duoc thu lai (toi da 3 lan).
    for (let attempt = 1; ; attempt++) {
      try {
        await this.page.goto('/login');
        await this.page.waitForLoadState('networkidle');
        await this.page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        break;
      } catch (error) {
        const interrupted = /ERR_ABORTED|Execution context was destroyed/.test((error as Error).message);
        if (!interrupted || attempt >= 3) throw error;
      }
    }
    await this.page.reload();
    await expect(this.heading).toBeVisible();
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Thong bao loi hien tren man hinh (validate field / sai tai khoan). */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
