import type { Page } from '@playwright/test';
import { test as sharedTest } from './shared-page-fixture';
import { LoginPage } from '../pages/login-page';
import { RonApiClient } from '../utils/ron-api-client';
import { addWorkingDays, shiftMonthStart, todayInVietnam } from '../utils/working-days';

/**
 * Fixture cho test can dang nhap bang account nhan vien (RON_USERNAME) va TAO DU LIEU THAT.
 *
 * - writeGuard: chan o tang mang MOI request ghi tru danh sach cho phep (tao don, tu huy don).
 *   Tranh test lo tay duyet/sua du lieu that tren moi truong dung chung. Request bi chan
 *   -> test fail o teardown.
 * - employeePage: dang nhap 1 lan cho ca worker (trinh duyet dung chung), test sau tai su dung.
 * - createdRequests: test ghi ID don vua tao vao day; teardown tu huy het (ke ca khi test fail).
 */

const TEST_DATA_PREFIX = 'AUTOTEST_';
/** Li do moi don do automation tao phai bat dau bang tien to nay (luoi an toan khi don dep). */
const AUTOMATION_REASON_PREFIX = `${TEST_DATA_PREFIX} RON-`;
const CLEANUP_NOTE = `${TEST_DATA_PREFIX} don dep sau automation`;

/** Cap method + path duoc phep ghi. Moi request ghi khac bi abort. */
const ALLOWED_WRITES: [method: string, path: RegExp][] = [
  ['POST', /^\/api\/auth\/(login|refreshToken)$/],
  ['POST', /^\/api\/workTimeRegisters\/(dayoffs|remotes|overtimes)$/],
  ['POST', /^\/api\/workTimeRegisters\/\d+\/selfCancel$/],
  ['POST', /^\/api\/workTime\/checkInRegisters$/], // multipart, kem anh bang chung
  ['POST', /^\/api\/workTime\/checkInRegisters\/\d+\/selfCancel$/],
];

export interface CreatedRequestTracker {
  add(id: number): void;
  readonly ids: readonly number[];
}

async function ensureLoggedIn(page: Page): Promise<void> {
  const username = process.env.RON_USERNAME;
  const password = process.env.RON_PASSWORD;
  if (!username || !password) throw new Error('Chua set RON_USERNAME / RON_PASSWORD trong .env');
  // Test truoc (vd dang xuat) co the de trang dang redirect -> cho on dinh; evaluate loi = coi nhu chua dang nhap.
  await page.waitForLoadState().catch(() => {});
  const hasToken = page.url().startsWith('http') && (await page.evaluate(() => !!localStorage.getItem('token')).catch(() => false));
  if (hasToken && !/\/login/.test(page.url())) return;
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(username, password);
  await page.waitForURL((url) => !/\/login/.test(url.pathname));
}

export const test = sharedTest.extend<{
  writeGuard: string[];
  employeePage: Page;
  api: RonApiClient;
  createdRequests: CreatedRequestTracker;
  checkInCleanup: void;
}>({
  writeGuard: async ({ page }, use) => {
    const blocked: string[] = [];
    const handler = async (route: import('@playwright/test').Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const isRead = request.method() === 'GET' || request.method() === 'OPTIONS';
      if (isRead || ALLOWED_WRITES.some(([method, re]) => method === request.method() && re.test(path))) return route.continue();
      blocked.push(`${request.method()} ${path}`);
      return route.abort();
    };
    await page.route('**/api/**', handler);
    await use(blocked);
    await page.unroute('**/api/**', handler);
    if (blocked.length) throw new Error(`Request ghi ngoai danh sach cho phep da bi chan: ${blocked.join(', ')}`);
  },

  employeePage: async ({ page, writeGuard }, use, testInfo) => {
    void writeGuard; // dam bao guard bat truoc khi dang nhap
    // Don dep theo tien to se huy don dang tao do cua worker khac + tranh chap han muc -> chi 1 worker.
    if (testInfo.config.workers > 1) throw new Error('Test RON tao du lieu that: phai chay voi --workers=1');
    await ensureLoggedIn(page);
    await use(page);
  },

  api: async ({ employeePage }, use) => {
    await use(new RonApiClient(employeePage));
  },

  createdRequests: async ({ api }, use) => {
    const ids: number[] = [];
    await use({ add: (id) => ids.push(id), ids });
    // Luoi an toan: don da gui len server nhung test khong lay duoc id (timeout, loi parse)
    // -> tim theo tien to trong khoang thang truoc .. +90 ngay. Don Remote "Co ke hoach" khong co
    // li do (reason = null) va danh sach khong tra `solution` -> doc chi tiet de xet Kenh giao tiep.
    const today = todayInVietnam();
    const orphans = await api.listMyRequests(`${shiftMonthStart(today, -1)}`, addWorkingDays(today, 65)).catch((e: Error) => {
      console.warn(`[createdRequests] Khong quet duoc don sot, co the con don AUTOTEST_ Cho xu ly: ${e.message}`);
      return [];
    });
    const isAutomation = (text: string | null | undefined) => !!text?.startsWith(AUTOMATION_REASON_PREFIX);
    for (const r of orphans.filter((x) => x.approvalStatus === 'PENDING' && !ids.includes(x.id))) {
      if (isAutomation(r.reason)) ids.push(r.id);
      else if (r.type === 'REMOTE' && !r.reason && isAutomation((await api.getDetail(r.id).catch(() => null))?.solution)) ids.push(r.id);
    }
    const failures: string[] = [];
    for (const id of ids) {
      const errorCode = await api.selfCancel(id, CLEANUP_NOTE).catch((e: Error) => e.message);
      if (errorCode) failures.push(`${id}: ${errorCode}`);
    }
    if (failures.length) throw new Error(`Khong tu huy duoc don test: ${failures.join('; ')}`);
  },

  // API tao don cham cong tra id = null -> don dep theo tien to li do. Don Huy khong tinh vao
  // han muc 5 lan/thang (QD-04-02 muc 1.7) nen huy het sau moi test de lan chay sau con luot.
  // Chi don Cho xu ly: automation khong bao gio duyet don.
  // Chay ca TRUOC test: don sot tu lan chay bi ngat (Ctrl+C) dang chiem han muc.
  checkInCleanup: async ({ api }, use) => {
    const cancelLeftovers = async () => {
      const today = todayInVietnam();
      const mine = await api.listMyCheckInRegisters(shiftMonthStart(today, -1), today);
      const failures: string[] = [];
      for (const r of mine.filter((x) => x.approvalStatus === 'PENDING' && x.reason?.startsWith(AUTOMATION_REASON_PREFIX))) {
        const errorCode = await api.selfCancelCheckInRegister(r.id, CLEANUP_NOTE).catch((e: Error) => e.message);
        if (errorCode) failures.push(`${r.id}: ${errorCode}`);
      }
      if (failures.length) throw new Error(`Khong tu huy duoc don cham cong test: ${failures.join('; ')}`);
    };
    await cancelLeftovers();
    await use();
    await cancelLeftovers();
  },
});

export { expect } from '@playwright/test';
export { AUTOMATION_REASON_PREFIX, TEST_DATA_PREFIX };
