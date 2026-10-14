import type { Page, Route } from '@playwright/test';
import { ensureLoggedIn, test as employeeTest } from './employee-session-fixture';
import { RonApiClient } from '../utils/ron-api-client';

/**
 * Fixture cho test can 2 vai cung luc (doc 14, 15): nhan vien (RON_USERNAME) tao don, TBP (RON_TBP_USERNAME)
 * duyet don. TBP chay trong context trinh duyet rieng, dang nhap 1 lan cho ca worker.
 *
 * approvalGuard: chan MOI request ghi cua TBP tru dang nhap va POST approval cho dung ID don test da
 * dang ky qua `allow(id)` (ID don Nghi phep/Remote/OT hoac don cham cong) -> khong bao gio duyet nham don that trong danh sach cua TBP.
 * Quyet dinh de lai du lieu VINH VIEN con bi chan them, tru khi RON_ALLOW_APPROVE=1 (chi chay tay, co chu dich):
 * - Don Nghi phep/Remote/OT (doc 14): Chap thuan (agree = true) - nhan vien khong tu huy duoc nua.
 * - Don cham cong (doc 15): MOI quyet dinh - Chap thuan (Cho xac nhan) va Tu choi deu khong tu huy duoc
 *   (server INVALID_STATUS, do 2026-10-13), van chiem ngay + han muc 5 don/thang.
 */

export const TBP_USERNAME = process.env.RON_TBP_USERNAME || '';
const TBP_PASSWORD = process.env.RON_TBP_PASSWORD || '';
export const APPROVE_WRITES_ENABLED = process.env.RON_ALLOW_APPROVE === '1';

/** Endpoint gui quyet dinh, kem gia tri `agree` gui duoc KHONG can RON_ALLOW_APPROVE=1 (null = khong co). */
const DECISION_ENDPOINTS: { kind: DecisionKind; path: RegExp; reversibleAgree: boolean | null }[] = [
  { kind: 'request', path: /^\/api\/workTimeRegisters\/(\d+)\/approval$/, reversibleAgree: false }, // doc 14
  { kind: 'checkIn', path: /^\/api\/workTime\/checkInRegisters\/(\d+)\/approve$/, reversibleAgree: null }, // doc 15
];

/** 'request' = don Nghi phep/Remote/OT, 'checkIn' = don cham cong - 2 day ID rieng, co the trung so. */
export type DecisionKind = 'request' | 'checkIn';

export interface ApprovalGuard {
  /** Cho phep TBP gui quyet dinh cho don `id` (don do test vua tao). */
  allow(id: number, kind?: DecisionKind): void;
}

export const test = employeeTest.extend<
  { approvalGuard: ApprovalGuard; approverPage: Page; approverApi: RonApiClient },
  { approverSessionPage: Page }
>({
  approverSessionPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  approvalGuard: async ({ approverSessionPage: page }, use) => {
    const allowedIds = new Set<string>(); // `${kind}:${id}`
    const blocked: string[] = [];
    const handler = async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'GET' || request.method() === 'OPTIONS') return route.continue();
      if (request.method() === 'POST' && /^\/api\/auth\/(login|refreshToken)$/.test(path)) return route.continue();
      const endpoint = request.method() === 'POST' ? DECISION_ENDPOINTS.find((e) => e.path.test(path)) : undefined;
      if (endpoint && allowedIds.has(`${endpoint.kind}:${Number(endpoint.path.exec(path)![1])}`)) {
        const agree = (request.postDataJSON() as { agree?: boolean } | null)?.agree;
        if (typeof agree === 'boolean' && (agree === endpoint.reversibleAgree || APPROVE_WRITES_ENABLED)) return route.continue();
      }
      blocked.push(`${request.method()} ${path}`);
      return route.abort();
    };
    await page.route('**/api/**', handler);
    await use({ allow: (id, kind = 'request') => allowedIds.add(`${kind}:${id}`) });
    await page.unroute('**/api/**', handler);
    if (blocked.length) throw new Error(`Request ghi cua TBP ngoai danh sach cho phep da bi chan: ${blocked.join(', ')}`);
  },

  approverPage: async ({ approverSessionPage: page, approvalGuard }, use) => {
    void approvalGuard; // dam bao guard bat truoc khi dang nhap
    await ensureLoggedIn(page, TBP_USERNAME, TBP_PASSWORD);
    await use(page);
  },

  approverApi: async ({ approverPage }, use) => {
    await use(new RonApiClient(approverPage));
  },
});

export { expect } from '@playwright/test';
export { AUTOMATION_REASON_PREFIX } from './employee-session-fixture';
