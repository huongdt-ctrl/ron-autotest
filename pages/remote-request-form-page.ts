import { expect, type Locator, type Page } from '@playwright/test';
import { closeRonModal, fillTimePeriods, ronModal, selectReactOption, submitRonModal, type TimePeriod } from './ron-modal-form-controls';

/**
 * Page Object cho modal "Don xin remote" (/work-time-management -> Tao don -> Remote).
 * Combo: 0 = Ke hoach, 1 = Nguoi kiem duyet. Chon "Khong co ke hoach" thi hien them
 * textarea Li do (bat buoc) va Anh bang chung (khong bat buoc) -> textarea lay theo placeholder.
 * API: Kenh giao tiep -> `solution`, SDT -> `emergencyRemoteContact`.
 */

export interface RemoteRequestInput {
  periods: TimePeriod[];
  planned?: boolean; // mac dinh Co ke hoach
  approver: string;
  channel: string;
  phone: string;
  /** Bat buoc khi planned = false. */
  reason?: string;
}

export interface RemoteSubmitResult {
  httpStatus: number | null;
  errorCode: string | null;
  createdId: number | null;
  toasts: string[];
}

export class RemoteRequestFormPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly reasonInput: Locator;
  readonly channelInput: Locator;
  readonly phoneInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = ronModal(page, 'Đơn xin remote');
    this.reasonInput = this.modal.locator('textarea[placeholder="Điền lí do của bạn"]');
    this.channelInput = this.modal.locator('textarea[placeholder="Hãy nhập kênh giao tiếp"]');
    this.phoneInput = this.modal.locator('textarea[placeholder="Hãy nhập số điện thoại cá nhân của bạn"]');
  }

  async open() {
    await this.page.goto('/work-time-management');
    // Mo modal truoc khi danh sach load xong -> trang re-render, modal bi go khoi DOM (flaky)
    await this.page.waitForLoadState('networkidle');
    await this.page.getByRole('button', { name: 'Tạo đơn' }).click();
    await this.page.getByRole('button', { name: 'Remote', exact: true }).filter({ visible: true }).first().click();
    await expect(this.modal).toBeVisible();
  }

  async close() {
    await closeRonModal(this.modal);
    await expect(this.modal).toBeHidden();
  }

  /** Thong bao loi validate hien trong modal. */
  fieldError(text: string): Locator {
    return this.modal.getByText(text, { exact: true });
  }

  async choosePlanned(planned: boolean) {
    await selectReactOption(this.page, this.modal, 0, planned ? 'Có kế hoạch' : 'Không có kế hoạch');
  }

  async fill(input: RemoteRequestInput) {
    await fillTimePeriods(this.page, this.modal, input.periods);
    if (input.planned === false) {
      await this.choosePlanned(false);
      await this.reasonInput.fill(input.reason ?? input.channel);
    }
    await selectReactOption(this.page, this.modal, 1, input.approver);
    await this.channelInput.fill(input.channel);
    await this.phoneInput.fill(input.phone);
  }

  /** Bam ✓ va xac nhan popup "Chu y"; cho response cua POST /remotes neu request duoc gui. */
  async submit(): Promise<RemoteSubmitResult> {
    const { data, ...rest } = await submitRonModal(this.page, this.modal, /\/api\/workTimeRegisters\/remotes$/);
    return { ...rest, createdId: data?.id ?? null };
  }
}
