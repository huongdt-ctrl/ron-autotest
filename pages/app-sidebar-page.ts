import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Sidebar chung cua RON (moi man sau dang nhap).
 * Mac dinh thu gon (chi icon, nhan an); bam nut 3 gach de mo rong,
 * roi bam ten nhom (Nghi phep..., Cham cong, Nhan su) de hien link con.
 */

const MENU_GROUPS = ['Nghỉ phép, Remote, OT', 'Chấm công', 'Nhân sự'] as const;

export class AppSidebarPage {
  readonly page: Page;
  readonly nav: Locator;
  readonly logoutButton: Locator;
  readonly logoutPopup: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nav = page.locator('ul').filter({ hasText: 'Trang chủ' }).first();
    this.logoutButton = page.getByRole('button', { name: 'Đăng xuất' });
    this.logoutPopup = page.locator('[class*="_modal_"]').filter({ hasText: 'Bạn có chắc chắn muốn đăng xuất?' }).last();
  }

  /** Mo rong sidebar va moi nhom menu. */
  async expandAll() {
    // Nut 3 gach khong co ten accessible: la button dung ngay truoc khoi profile.
    await this.page.locator('button:has(+ div a[href="/profile"])').click();
    for (const group of MENU_GROUPS) {
      const label = this.nav.getByText(group, { exact: true });
      await expect(label).toBeVisible();
      await label.click();
    }
  }

  /** href cua moi link trong sidebar (goi sau expandAll). */
  async menuHrefs(): Promise<string[]> {
    return this.nav.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  }

  async openLogoutPopup() {
    await this.logoutButton.click();
    await expect(this.logoutPopup).toBeVisible();
  }

  async confirmLogout() {
    await this.logoutPopup.locator('[class*="_accept_"]').click();
  }

  async cancelLogout() {
    await this.logoutPopup.locator('[class*="_btn_"]:not([class*="_accept_"])').click();
  }
}
