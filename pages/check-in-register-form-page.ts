import { expect, type Locator, type Page } from '@playwright/test';
import type { IsoDate } from '../utils/working-days';
import {
  closeRonModal,
  pickDatepickerDay,
  pickDatepickerTimes,
  ronModal,
  selectReactOption,
  submitRonModal,
  type ModalSubmitResult,
} from './ron-modal-form-controls';

/**
 * Page Object cho modal "Don cham cong" (/check-in-register -> Them moi).
 * Form chi co 1 khoang thoi gian, khong co "Ca ngay"; datepicker chi cho chon ngay da qua.
 * API tao (multipart) tra data.id = null -> test lay don vua tao qua API danh sach.
 */

export interface CheckInRegisterInput {
  approver: string;
  day: IsoDate;
  checkIn: string; // 'HH:mm', buoc 5 phut
  checkOut: string;
  reason: string;
  /** Tick "Lam viec tu xa (remote)" (QD-04-02 muc 3.5). Mac dinh khong tick. */
  remote?: boolean;
  /** Mac dinh dinh kem 1 anh PNG 1x1. false = bo trong (de test validation). */
  withEvidence?: boolean;
}

/** PNG 1x1 trong suot, du de qua accept="image/*" va validate phia server. */
const EVIDENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export class CheckInRegisterFormPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly dayInput: Locator;
  readonly reasonInput: Locator;
  readonly evidenceInput: Locator;
  /** Checkbox tu ve (div _svgBox_, khong phai input). Bam vao NHAN khong tick duoc (do 08/10) -> bam o vuong. */
  readonly remoteCheckbox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = ronModal(page, 'Đơn chấm công');
    this.dayInput = this.modal.locator('input[placeholder="Chọn ngày"]');
    this.reasonInput = this.modal.locator('textarea');
    this.evidenceInput = this.modal.locator('input[type="file"]');
    this.remoteCheckbox = this.modal.locator('[class*="_svgBox_"]');
  }

  async open() {
    await this.page.goto('/check-in-register');
    // Mo modal truoc khi danh sach load xong -> trang re-render, modal bi go khoi DOM (flaky)
    await this.page.waitForLoadState('networkidle');
    await this.page.getByRole('button', { name: 'Thêm mới' }).click();
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

  /** O ngay cua thang dang hien tren datepicker (mo datepicker truoc). */
  datepickerDays(): Locator {
    return this.page.locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)');
  }

  async openDatepicker() {
    await this.dayInput.click();
  }

  /** Chon gio bat dau roi mo danh sach gio ket thuc; tra ve cac moc bi khoa. */
  async disabledEndTimesAfterStart(start: string): Promise<string[]> {
    await this.modal.locator('input[placeholder="Chọn thời gian bắt đầu"]').click();
    await this.page.locator('.react-datepicker__time-list-item').filter({ hasText: new RegExp(`^${start}$`) }).first().click();
    await this.modal.click({ position: { x: 5, y: 5 } }); // dong popup gio bat dau
    await this.modal.locator('input[placeholder="Chọn thời gian kết thúc"]').click();
    return this.page.locator('.react-datepicker__time-list-item--disabled').allInnerTexts();
  }

  async fill(input: CheckInRegisterInput) {
    await selectReactOption(this.page, this.modal, 0, input.approver);
    await pickDatepickerDay(this.page, this.dayInput, input.day);
    await pickDatepickerTimes(this.page, this.modal, 0, input.checkIn, input.checkOut);
    await this.reasonInput.fill(input.reason);
    if (input.remote) await this.remoteCheckbox.click();
    if (input.withEvidence !== false) {
      await this.evidenceInput.setInputFiles({ name: 'AUTOTEST_evidence.png', mimeType: 'image/png', buffer: EVIDENCE_PNG });
    }
  }

  /** Bam ✓ va xac nhan popup "Chu y"; cho response cua POST /checkInRegisters neu request duoc gui. */
  async submit(): Promise<Omit<ModalSubmitResult, 'data'>> {
    // data.id luon null voi API nay -> bo
    const { data: _data, ...rest } = await submitRonModal(this.page, this.modal, /\/api\/workTime\/checkInRegisters$/);
    return rest;
  }
}
