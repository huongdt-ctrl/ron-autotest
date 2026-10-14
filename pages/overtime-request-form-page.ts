import { expect, type Locator, type Page } from '@playwright/test';
import { closeRonModal, pickDatepickerDay, pickDatepickerTimes, ronModal, selectReactOption, submitRonModal } from './ron-modal-form-controls';
import type { IsoDate } from '../utils/working-days';

/**
 * Page Object cho modal "Don xin OT" (/work-time-management -> Tao don -> OT).
 * Combo: 0 = Ke hoach, 1 = Nguoi kiem duyet. Khac Nghi phep/Remote: 1 Ngay OT cho ca don,
 * moi khoang thoi gian chi co gio bat dau/ket thuc, khong co switch "Ca ngay".
 * API: POST /api/workTimeRegisters/overtimes {havePlanned, day, timeIntervals[{from,to}], assignedUserId, reason}.
 */

export interface OvertimeInterval {
  from: string; // 'HH:mm', buoc 15 phut
  to: string;
}

export interface OvertimeRequestInput {
  day: IsoDate;
  intervals: OvertimeInterval[];
  planned?: boolean; // mac dinh Co ke hoach
  approver: string;
  reason: string;
}

export interface OvertimeSubmitResult {
  httpStatus: number | null;
  errorCode: string | null;
  createdId: number | null;
  toasts: string[];
}

export class OvertimeRequestFormPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly dayInput: Locator;
  readonly reasonInput: Locator;
  readonly addIntervalButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = ronModal(page, 'Đơn xin OT');
    this.dayInput = this.modal.locator('input[placeholder="Chọn ngày"]');
    this.reasonInput = this.modal.locator('textarea[placeholder="Điền lí do của bạn"]');
    this.addIntervalButton = this.modal.getByRole('button', { name: 'Thêm khoảng thời gian' });
  }

  async open() {
    await this.page.goto('/work-time-management');
    // Mo modal truoc khi danh sach load xong -> trang re-render, modal bi go khoi DOM (flaky)
    await this.page.waitForLoadState('networkidle');
    await this.page.getByRole('button', { name: 'Tạo đơn' }).click();
    await this.page.getByRole('button', { name: 'OT', exact: true }).filter({ visible: true }).first().click();
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

  async pickDay(day: IsoDate) {
    await pickDatepickerDay(this.page, this.dayInput, day);
  }

  async fill(input: OvertimeRequestInput) {
    if (input.planned === false) await selectReactOption(this.page, this.modal, 0, 'Không có kế hoạch');
    await this.pickDay(input.day);
    for (let i = 1; i < input.intervals.length; i++) await this.addIntervalButton.click();
    for (const [index, { from, to }] of input.intervals.entries()) await pickDatepickerTimes(this.page, this.modal, index, from, to);
    await selectReactOption(this.page, this.modal, 1, input.approver);
    await this.reasonInput.fill(input.reason);
  }

  /** Bam ✓ va xac nhan popup "Chu y"; cho response cua POST /overtimes neu request duoc gui. */
  async submit(): Promise<OvertimeSubmitResult> {
    const { data, ...rest } = await submitRonModal(this.page, this.modal, /\/api\/workTimeRegisters\/overtimes$/);
    return { ...rest, createdId: data?.id ?? null };
  }
}
