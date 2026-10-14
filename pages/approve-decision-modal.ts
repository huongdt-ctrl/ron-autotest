import { expect, type Locator, type Page } from '@playwright/test';
import { closeRonModal, ronModal, selectReactOption, submitRonModal, type ModalSubmitResult } from './ron-modal-form-controls';
import { readDetails } from './work-time-request-modals';

/**
 * Modal chi tiet + khoi "Quyet dinh" cua 2 man duyet cua TBP, cung khung (react-select Quyet dinh mac dinh
 * Chap thuan, textarea Ghi chu bat buoc khi Tu choi, ✓ -> popup "Chu y" -> ✓ -> POST quyet dinh {agree, note}):
 * - REQUEST_DECISION (doc 14) "Chi tiet don": mo modal goi GET chi tiet. Don da xu ly: khong con khoi
 *   Quyet dinh; don Chap thuan van con nut ✓ (khong lam gi), don Tu choi thi khong.
 * - CHECK_IN_DECISION (doc 15) "Thong tin chi tiet": du lieu lay tu dong danh sach, KHONG goi API khi mo.
 *   Ghi chu bi disable khi Chap thuan. Don da xu ly: khong con khoi Quyet dinh va nut ✓.
 */

export const DECISION_LABELS = { approve: 'Chấp thuận', reject: 'Từ chối' } as const;
export const APPROVE_SUCCESS_TOAST = 'Đã chấp nhận yêu cầu';
export const REJECT_SUCCESS_TOAST = 'Đã từ chối yêu cầu';
export const DECISION_CONFIRM_TEXT = 'Bạn đã chắc chắn với quyết định của mình chưa?';
export const APPROVED_BY_LABEL = 'Người đã duyệt';

export interface DecisionModalVariant {
  title: string;
  /** POST gui quyet dinh. */
  decisionApi: RegExp;
  /** GET modal goi khi mo (null = modal dung du lieu co san cua dong). */
  detailApi: RegExp | null;
}

export const REQUEST_DECISION: DecisionModalVariant = {
  title: 'Chi tiết đơn',
  decisionApi: /^\/api\/workTimeRegisters\/\d+\/approval$/,
  detailApi: /^\/api\/workTimeRegisters\/\d+$/,
};

export const CHECK_IN_DECISION: DecisionModalVariant = {
  title: 'Thông tin chi tiết',
  decisionApi: /^\/api\/workTime\/checkInRegisters\/\d+\/approve$/,
  detailApi: null,
};

export class ApproveDecisionModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly decisionCombo: Locator;
  /** Gia tri dang chon cua react-select Quyet dinh. */
  readonly decisionValue: Locator;
  readonly noteInput: Locator;
  readonly acceptButton: Locator;
  readonly confirmPopup: Locator;

  constructor(
    page: Page,
    readonly variant: DecisionModalVariant = REQUEST_DECISION,
  ) {
    this.page = page;
    const heading = new RegExp(`^${variant.title}$`);
    this.modal = ronModal(page, variant.title).filter({ has: page.locator('h1', { hasText: heading }) });
    this.decisionCombo = this.modal.locator('input[role="combobox"]');
    this.decisionValue = this.modal.locator('[class*="singleValue"]');
    this.noteInput = this.modal.locator('textarea[placeholder="Nhập ghi chú"]');
    this.acceptButton = this.modal.locator('[class*="_accept_"]');
    this.confirmPopup = page.locator('[class*="_modal_"]').filter({ hasText: 'Chú ý' }).last();
  }

  /** Bam `trigger` (icon o cot Tuy chinh), doi API chi tiet (neu co) tra ve va modal render du lieu. */
  async open(trigger: Locator) {
    const { detailApi } = this.variant;
    const response = detailApi
      ? this.page.waitForResponse((r) => r.request().method() === 'GET' && detailApi.test(new URL(r.url()).pathname))
      : null;
    await trigger.click();
    await response;
    await expect(this.modal.locator('[class*="_detail_"] h2').first()).toBeVisible();
  }

  details(): Promise<Record<string, string>> {
    return readDetails(this.modal);
  }

  async chooseDecision(decision: keyof typeof DECISION_LABELS) {
    await selectReactOption(this.page, this.modal, 0, DECISION_LABELS[decision]);
    await expect(this.decisionValue).toHaveText(DECISION_LABELS[decision]);
  }

  fieldError(text: string): Locator {
    return this.modal.getByText(text, { exact: true });
  }

  /** Bam ✓ cua modal, chi mo popup "Chu y" (chua xac nhan). */
  async clickAccept() {
    await this.acceptButton.last().click();
    await expect(this.confirmPopup).toBeVisible();
  }

  /** Bam ✕ cua popup "Chu y": quay lai modal, khong gui request. */
  async dismissConfirmPopup() {
    await this.confirmPopup.locator('[class*="_btn_"]:not([class*="_accept_"])').first().click();
    await expect(this.confirmPopup).toBeHidden();
  }

  /** Bam ✓ + xac nhan popup; doc toast va response POST quyet dinh (httpStatus null neu client chan). */
  submit(): Promise<ModalSubmitResult> {
    return submitRonModal(this.page, this.modal, this.variant.decisionApi);
  }

  /** Anh bang chung trong modal (doc 15). */
  evidenceImages(): Locator {
    return this.modal.locator('[class*="_wrapImage_"] img');
  }

  async close() {
    await closeRonModal(this.modal);
    await expect(this.modal).toBeHidden();
  }
}
