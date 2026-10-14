import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Header chung cua RON (moi man sau dang nhap) - doc 12.
 * Gom: logo (ve `/`), nut "Cham cong remote", dropdown ngon ngu (react-select).
 *
 * ⚠️ KHONG BAO GIO click `remoteCheckInButton`: nut cham cong NGAY khi click, khong xac nhan
 * -> tao du lieu cham cong that (thoa thuan doc 12). writeGuard cung chan request ghi do.
 *
 * Ngon ngu luu o localStorage `i18nextLng` cua trinh duyet dung chung -> test doi ngon ngu
 * phai tra ve `vi` (resetLanguage) de case sau van thay nhan tieng Viet.
 */

export const LANGUAGE_STORAGE_KEY = 'i18nextLng';

/** Nhan hien tren header theo ngon ngu dang chon. Option cua dropdown cung dich theo ngon ngu. */
export const HEADER_LABELS = {
  vi: { remoteCheckIn: 'Chấm công remote', selected: 'Tiếng Việt', options: ['Tiếng Việt', 'Tiếng Anh'] },
  en: { remoteCheckIn: 'Remote check-in', selected: 'English', options: ['Vietnamese', 'English'] },
} as const;

export type Language = keyof typeof HEADER_LABELS;

export class AppHeaderPage {
  readonly page: Page;
  readonly header: Locator;
  readonly logo: Locator;
  readonly remoteCheckInButton: Locator;
  /** Khung react-select (input combobox nam ngoai viewport nen phai bam khung nay). */
  readonly languageControl: Locator;
  /** Gia tri dang chon (co cờ + ten ngon ngu). */
  readonly languageValue: Locator;
  readonly languageOptions: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('header');
    this.logo = this.header.locator('a[href="/"]');
    this.remoteCheckInButton = this.header.locator('button[class*="_remoteCheckIn_"]');
    this.languageControl = this.header.locator('div:has(> span[role="log"])');
    this.languageValue = this.languageControl.locator('[class*="singleValue"]');
    this.languageOptions = page.getByRole('option');
  }

  /** Mo dropdown ngon ngu va doi danh sach option hien. */
  async openLanguageMenu() {
    await this.languageControl.click();
    await expect(this.languageOptions.first()).toBeVisible();
  }

  async languageOptionTexts(): Promise<string[]> {
    return (await this.languageOptions.allInnerTexts()).map((t) => t.trim());
  }

  /** Text cac option dang aria-selected=true. */
  async selectedOptionTexts(): Promise<string[]> {
    return this.languageOptions.evaluateAll((options) =>
      options.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => (o.textContent ?? '').trim()),
    );
  }

  /** Chon option theo nhan (nhan phu thuoc ngon ngu hien tai, vd 'Tiếng Anh' / 'Vietnamese'). */
  async chooseLanguage(optionLabel: string) {
    await this.openLanguageMenu();
    await this.languageOptions.filter({ hasText: optionLabel }).click();
    await expect(this.languageOptions).toHaveCount(0);
  }

  async storedLanguage(): Promise<string | null> {
    return this.page.evaluate((key) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY);
  }

  /** Dua trinh duyet dung chung ve tieng Viet (khong qua UI, de chay duoc ca khi test fail giua chung). */
  async resetLanguage() {
    if (!this.page.url().startsWith('http')) return;
    if ((await this.storedLanguage().catch(() => 'vi')) === 'vi') return;
    await this.page.evaluate((key) => localStorage.setItem(key, 'vi'), LANGUAGE_STORAGE_KEY);
    await this.page.reload();
    await expect(this.remoteCheckInButton).toHaveText(HEADER_LABELS.vi.remoteCheckIn);
  }
}
