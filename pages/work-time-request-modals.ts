import { expect, type Locator, type Page } from '@playwright/test';
import { closeRonModal, ronModal, submitRonModal, type ModalSubmitResult } from './ron-modal-form-controls';

/**
 * Cac modal cua man "Don dang ky" (doc 04): "Chi tiet don" (👁), "Huy don" (🗑), "Thong ke".
 * Moi modal la danh sach cap <h2>nhan</h2><div>gia tri</div> trong span._detail_.
 */

export const CANCEL_SUCCESS_TOAST = 'Hủy thành công!';
export const REQUIRED_FIELD_ERROR = 'Không được để trống trường này!';
export const EMPTY_NOTE = '-----';

/** Doc cap nhan -> gia tri cua modal (bo qua span rong). */
export async function readDetails(modal: Locator): Promise<Record<string, string>> {
  const pairs = await modal.locator('[class*="_detail_"]').evaluateAll((spans) =>
    spans.map((s) => [(s.querySelector('h2')?.textContent ?? '').trim(), (s.querySelector('div')?.textContent ?? '').trim()]),
  );
  return Object.fromEntries(pairs.filter(([label]) => label));
}

/** Modal chi doc (Chi tiet don / Thong ke): chi co 1 nut dong. */
class ReadOnlyModal {
  readonly modal: Locator;

  constructor(
    readonly page: Page,
    title: string,
    /** API GET modal goi khi mo; modal hien khung truoc khi co du lieu -> phai doi response. */
    private readonly apiPath: RegExp,
  ) {
    this.modal = ronModal(page, title).filter({ has: page.locator('h1', { hasText: new RegExp(`^${title}$`) }) });
  }

  /** Bam `trigger` (nut 👁 / Thong ke), doi API cua modal tra ve va modal render du lieu. */
  async open(trigger: Locator) {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && this.apiPath.test(new URL(r.url()).pathname),
    );
    await trigger.click();
    await response;
    await expect(this.modal.locator('[class*="_detail_"] h2').first()).toBeVisible();
  }

  details(): Promise<Record<string, string>> {
    return readDetails(this.modal);
  }

  async close() {
    await this.modal.locator('[class*="_btn_"]').last().click();
    await expect(this.modal).toBeHidden();
  }
}

export class RequestDetailModal extends ReadOnlyModal {
  constructor(page: Page) {
    super(page, 'Chi tiết đơn', /^\/api\/workTimeRegisters\/\d+$/);
  }

  /** Cac dong thoi gian dang ky ('Tu 09:00 den 11:00'). */
  async timeItems(): Promise<string[]> {
    return (await this.modal.locator('[class*="_timeItem_"]').allInnerTexts()).map((t) => t.trim());
  }
}

export class RequestStatisticsModal extends ReadOnlyModal {
  constructor(page: Page) {
    super(page, 'Thống kê', /^\/api\/workTime\/summary$/);
  }
}

export class CancelRequestModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly reasonInput: Locator;
  readonly confirmPopup: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = ronModal(page, 'Hủy đơn').filter({ has: page.locator('textarea') });
    this.reasonInput = this.modal.locator('textarea');
    this.confirmPopup = page.locator('[class*="_modal_"]').filter({ hasText: 'Chú ý' }).last();
  }

  fieldError(text: string): Locator {
    return this.modal.getByText(text, { exact: true });
  }

  /** Bam ✓ cua modal, chi mo popup "Chu y" (chua xac nhan). */
  async clickAccept() {
    await this.modal.locator('[class*="_accept_"]').last().click();
    await expect(this.confirmPopup).toBeVisible();
  }

  /** Bam ✕ cua popup "Chu y": quay lai modal, khong gui request. */
  async dismissConfirmPopup() {
    await this.confirmPopup.locator('[class*="_btn_"]:not([class*="_accept_"])').first().click();
    await expect(this.confirmPopup).toBeHidden();
  }

  /** Bam ✓ + xac nhan popup; doc toast va response POST selfCancel (null neu client chan). */
  submit(): Promise<ModalSubmitResult> {
    return submitRonModal(this.page, this.modal, /^\/api\/workTimeRegisters\/\d+\/selfCancel$/);
  }

  async close() {
    await closeRonModal(this.modal);
    await expect(this.modal).toBeHidden();
  }
}

/** So phut (API) -> chuoi gio nhu UI hien thi: 480 -> '8', 1056 -> '17.6', 210 -> '3.5'. */
export function minutesToHoursText(minutes: number): string {
  return String(Number((minutes / 60).toFixed(2)));
}
