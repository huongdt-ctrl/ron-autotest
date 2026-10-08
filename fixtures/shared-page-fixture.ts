import { test as base, type Page } from '@playwright/test';

/**
 * Dung chung 1 cua so trinh duyet cho MOI test trong cung worker (workers: 1 → ca luot chay),
 * de chay lien mach case nay sang case sau, khong dong/mo lai trinh duyet.
 *
 * Danh doi: test KHONG con co lap — trang thai (dang nhap, du lieu form...) cua case truoc
 * di tiep sang case sau, nen moi case phai tu dua man hinh ve trang thai can thiet
 * (vd LoginPage.goto() tu xoa phien dang nhap). Khi 1 test fail, Playwright khoi dong lai
 * worker → trinh duyet mo lai 1 lan roi chay tiep.
 */
export const test = base.extend<{ pauseAfterCase: void }, { sharedPage: Page }>({
  // PAUSE_AFTER_CASE=3 → dung 3 giay sau moi case (ke ca case fail) de nhin ket qua tren man hinh.
  // Mac dinh 0: chay an / CI khong bi cham.
  pauseAfterCase: [
    async ({}, use) => {
      await use();
      const seconds = Number(process.env.PAUSE_AFTER_CASE) || 0;
      if (seconds > 0) await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    },
    { auto: true },
  ],
  sharedPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
  // Thay page mac dinh (moi test 1 cua so) bang page dung chung.
  page: async ({ sharedPage }, use) => {
    await use(sharedPage);
  },
});

export { expect } from '@playwright/test';
