import { expect, type Locator, type Page } from '@playwright/test';
import type { IsoDate } from '../utils/working-days';
import { closeRonModal, fillTimePeriods, ronModal, selectReactOption, submitRonModal, type TimePeriod } from './ron-modal-form-controls';

/**
 * Page Object cho modal "Don xin nghi phep" (/work-time-management -> Tao don -> Nghi phep).
 * Thao tac react-select / react-datepicker / popup "Chu y" dung chung o ron-modal-form-controls.
 */

export type LeavePeriod = TimePeriod;

export interface LeaveRequestInput {
  periods: LeavePeriod[];
  planned?: boolean; // mac dinh Co ke hoach
  leaveType?: string; // nhan hien thi, mac dinh 'Nghỉ không hưởng lương' (khong tru quy phep)
  approver: string;
  reason: string;
  solution?: string;
}

export interface SubmitResult {
  /** HTTP status cua POST /dayoffs; null neu client chan, request khong duoc gui. */
  httpStatus: number | null;
  /** errorCode server tra trong body (loi nghiep vu tra HTTP 200). */
  errorCode: string | null;
  createdId: number | null;
  toasts: string[];
}

export class LeaveRequestFormPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly addPeriodButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = ronModal(page, 'Đơn xin nghỉ phép');
    this.addPeriodButton = this.modal.getByRole('button', { name: 'Thêm khoảng thời gian' });
  }

  async open() {
    await this.page.goto('/work-time-management');
    // Mo modal truoc khi danh sach load xong -> trang re-render, modal bi go khoi DOM (flaky)
    await this.page.waitForLoadState('networkidle');
    await this.page.getByRole('button', { name: 'Tạo đơn' }).click();
    await this.page.getByRole('button', { name: 'Nghỉ phép', exact: true }).filter({ visible: true }).first().click();
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

  async addPeriods(count: number) {
    for (let i = 0; i < count; i++) await this.addPeriodButton.click();
  }

  async fill(input: LeaveRequestInput) {
    await fillTimePeriods(this.page, this.modal, input.periods);
    if (input.planned === false) await selectReactOption(this.page, this.modal, 0, 'Không có kế hoạch');
    await selectReactOption(this.page, this.modal, 1, input.leaveType ?? 'Nghỉ không hưởng lương');
    await selectReactOption(this.page, this.modal, 2, input.approver);
    await this.modal.locator('textarea').nth(0).fill(input.reason);
    await this.modal.locator('textarea').nth(1).fill(input.solution ?? input.reason);
  }

  /** Bam ✓ va xac nhan popup "Chu y"; cho response cua POST /dayoffs neu request duoc gui. */
  async submit(): Promise<SubmitResult> {
    const { data, ...rest } = await submitRonModal(this.page, this.modal, /\/api\/workTimeRegisters\/dayoffs$/);
    return { ...rest, createdId: data?.id ?? null };
  }
}
