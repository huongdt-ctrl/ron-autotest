import type { Page } from '@playwright/test';
import { AUTOMATION_REASON_PREFIX, APPROVE_WRITES_ENABLED, expect, TBP_USERNAME, test } from '../../fixtures/approver-session-fixture';
import { createPendingLeave } from '../../fixtures/request-test-helpers';
import {
  APPROVE_SUCCESS_TOAST,
  APPROVED_BY_LABEL,
  ApproveDecisionModal,
  DECISION_CONFIRM_TEXT,
  DECISION_LABELS,
  REJECT_SUCCESS_TOAST,
} from '../../pages/approve-decision-modal';
import { ApproveRequestListPage } from '../../pages/approve-request-list-page';
import { OvertimeRequestFormPage } from '../../pages/overtime-request-form-page';
import { STATUS_LABELS, WorkTimeRequestListPage } from '../../pages/work-time-request-list-page';
import { REQUIRED_FIELD_ERROR } from '../../pages/work-time-request-modals';
import type { RonApiClient } from '../../utils/ron-api-client';
import { shiftDays, todayInVietnam, type IsoDate } from '../../utils/working-days';

// Man "Phe duyet don" (doc 14), role TBP - quyet dinh Chap thuan / Tu choi.
// Nhan vien (RON_USERNAME) tao don that, chon TBP (RON_TBP_USERNAME) lam nguoi kiem duyet; TBP xu ly
// trong context rieng. Guard chi cho TBP gui approval cho dung don test da allow().
// - Don con Cho xu ly: fixture createdRequests (nhan vien) tu huy.
// - Don Tu choi: giai phong ngay, khong anh huong han muc -> de lai.
// - Don Chap thuan: KHONG huy duoc -> chi case @approve-writes, chay tay voi RON_ALLOW_APPROVE=1, dung don
//   OT Thu 7 09:00-11:00 (QD 5.5: tru 4 gio dau T7 -> 0 gio OT, it anh huong nhat).

test.describe('Phe duyet don (TBP) - quyet dinh', () => {
  test.skip(!TBP_USERNAME || !process.env.RON_TBP_PASSWORD, 'Chua set RON_TBP_USERNAME / RON_TBP_PASSWORD trong .env');

  let screen: ApproveRequestListPage;
  let decision: ApproveDecisionModal;

  test.beforeEach(async ({ approverPage }) => {
    screen = new ApproveRequestListPage(approverPage);
    decision = new ApproveDecisionModal(approverPage);
  });

  test.afterEach(async () => {
    await decision.close();
  });

  /** TBP mo danh sach dung ngay cua don, tra ve dong cua don. */
  async function openRowAsTbp(day: IsoDate, reason: string) {
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: day, to: day });
    const row = screen.rowByReason(reason);
    await expect(row).toHaveCount(1);
    return row;
  }

  async function openPendingLeave(employeePage: Page, api: RonApiClient, tag: string) {
    const leave = await createPendingLeave(employeePage, api, TBP_USERNAME, tag);
    const row = await openRowAsTbp(leave.day, leave.reason);
    return { leave, row };
  }

  test('[RON-APPROVE-005] Don moi cua nhan vien: hien o TBP, 1 icon mo chi tiet, Quyet dinh mac dinh Chap thuan', async ({
    api,
    employeePage,
    createdRequests,
  }) => {
    // Arrange
    const { leave, row } = await openPendingLeave(employeePage, api, 'APPROVE-005');
    createdRequests.add(leave.id); // test khong xu ly -> fixture tu huy
    expect(await row.locator('td').nth(1).innerText()).toBe(process.env.RON_USERNAME);
    await expect(row.locator('td').nth(4)).toHaveText(STATUS_LABELS.PENDING);

    // Cot Tuy chinh chi con 1 icon (do 2026-10-13; truoc day 2 icon mo cung modal - doc 14 diem bat thuong 3)
    await expect(row.locator('td').nth(5).locator('button')).toHaveCount(1);

    // Act 1: mo chi tiet
    await decision.open(screen.actionButton(row));

    // Assert: noi dung chi tiet + gia tri mac dinh (diem bat thuong 1)
    expect((await decision.details())['Lí do']).toBe(leave.reason);
    await expect(decision.decisionValue).toHaveText(DECISION_LABELS.approve);
    await expect(decision.noteInput).toHaveValue('');

    // Act 2: ✓ -> popup "Chu y" -> ✕
    await decision.clickAccept();
    await expect(decision.confirmPopup).toContainText(DECISION_CONFIRM_TEXT);
    await decision.dismissConfirmPopup();

    // Assert: quay lai modal, don van Cho xu ly (guard bat neu co approval bi gui)
    await expect(decision.modal).toBeVisible();
    expect((await api.getDetail(leave.id)).approvalStatus).toBe('PENDING');
  });

  test('[RON-APPROVE-006] Tu choi de trong Ghi chu: bao loi bat buoc, khong gui approval', async ({ api, employeePage, createdRequests }) => {
    // Arrange: KHONG allow() -> neu client van gui approval, guard chan va test fail o teardown
    const { leave, row } = await openPendingLeave(employeePage, api, 'APPROVE-006');
    createdRequests.add(leave.id);
    await decision.open(screen.actionButton(row));
    await decision.chooseDecision('reject');

    // Act
    const result = await decision.submit();

    // Assert
    expect(result.httpStatus, 'Client phai chan, khong gui approval').toBeNull();
    await expect(decision.fieldError(REQUIRED_FIELD_ERROR)).toBeVisible();
    expect((await api.getDetail(leave.id)).approvalStatus).toBe('PENDING');
  });

  test('[RON-APPROVE-007] Tu choi co Ghi chu: toast, trang thai Tu choi o ca 2 phia, mo lai chi xem', async ({
    api,
    employeePage,
    approvalGuard,
  }) => {
    // Arrange: khong add createdRequests - don Tu choi khong tu huy duoc; fail truoc khi tu choi
    // thi fixture van quet don AUTOTEST_ Cho xu ly va huy.
    const { leave, row } = await openPendingLeave(employeePage, api, 'APPROVE-007');
    approvalGuard.allow(leave.id);
    const note = `${AUTOMATION_REASON_PREFIX}APPROVE-007 tu choi`;
    await decision.open(screen.actionButton(row));
    await decision.chooseDecision('reject');
    await decision.noteInput.fill(note);

    // Act
    const result = await decision.submit();

    // Assert: server
    expect(result.httpStatus).toBe(200);
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain(REJECT_SUCCESS_TOAST);
    await expect(decision.modal).toBeHidden();
    const detail = await api.getDetail(leave.id);
    expect(detail).toMatchObject({ approvalStatus: 'REJECTED', note, actualApprovalUser: { username: TBP_USERNAME } });

    // Assert: TBP - danh sach + mo lai chi doc (khong khoi Quyet dinh, khong nut ✓)
    await expect(row.locator('td').nth(4)).toHaveText(STATUS_LABELS.REJECTED);
    await decision.open(screen.actionButton(row));
    const details = await decision.details();
    expect(details['Ghi chú']).toBe(note);
    expect(details[APPROVED_BY_LABEL], `Thieu dong "${APPROVED_BY_LABEL}"`).toBeTruthy();
    await expect(decision.decisionCombo).toHaveCount(0);
    await expect(decision.acceptButton).toHaveCount(0);

    // Assert: nhan vien thay Tu choi o Don dang ky (doc 04)
    const employeeList = new WorkTimeRequestListPage(employeePage);
    await employeeList.goto({ page: 1, size: 20, type: 'null', status: 'null', from: leave.day, to: leave.day });
    await expect(employeeList.rowByReason(leave.reason).locator('td').nth(4)).toHaveText(STATUS_LABELS.REJECTED);
  });

  test('[RON-APPROVE-008] @approve-writes Chap thuan OT T7 khong ghi chu; mo lai van con ✓ nhung khong lam gi', async ({
    api,
    employeePage,
    approvalGuard,
  }) => {
    test.skip(!APPROVE_WRITES_ENABLED, 'Chap thuan de lai du lieu vinh vien -> chi chay tay voi RON_ALLOW_APPROVE=1');

    // Arrange: nhan vien tao OT T7 09:00-11:00 tren T7 con trong
    const day = await firstFreeSaturday(api);
    const reason = `${AUTOMATION_REASON_PREFIX}APPROVE-008 ${Date.now()}`;
    const form = new OvertimeRequestFormPage(employeePage);
    await form.open();
    await form.fill({ day, intervals: [{ from: '09:00', to: '11:00' }], approver: TBP_USERNAME, reason });
    const created = await form.submit();
    await form.close();
    expect(created.createdId, JSON.stringify(created)).not.toBeNull();
    approvalGuard.allow(created.createdId!);
    const row = await openRowAsTbp(day, reason);
    await decision.open(screen.actionButton(row));

    // Act: giu Quyet dinh mac dinh (Chap thuan), ghi chu trong
    const result = await decision.submit();

    // Assert: server + danh sach
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain(APPROVE_SUCCESS_TOAST);
    expect(await api.getDetail(created.createdId!)).toMatchObject({
      approvalStatus: 'APPROVED',
      actualApprovalUser: { username: TBP_USERNAME },
    });
    await expect(row.locator('td').nth(4)).toHaveText(STATUS_LABELS.APPROVED);

    // Act 2: mo lai don da Chap thuan, bam ✓ + xac nhan (doc 14 diem bat thuong 2)
    await decision.open(screen.actionButton(row));
    await expect(decision.decisionCombo).toHaveCount(0);
    await expect(decision.acceptButton.last()).toBeVisible();
    const again = await decision.submit();

    // Assert 2: khong gui approval, khong toast, van Chap thuan
    expect(again.httpStatus, 'Don da duyet khong duoc gui approval lan 2').toBeNull();
    expect(again.toasts).toEqual([]);
    expect((await api.getDetail(created.createdId!)).approvalStatus).toBe('APPROVED');

    // Assert 3: QD-04-02 muc 5.5 - OT T7 tru 4 gio dau -> 09:00-11:00 ra 0 gio OT (doc 14)
    const [year, month] = day.split('-').map(Number);
    expect((await api.monthlyWorkingHours(year, month)).find((d) => d.date === day)?.overTimeTotal).toBe(0);

    // Assert 4: nhan vien khong tu huy duoc don da Chap thuan (doc 14 Dependency)
    expect(await api.selfCancel(created.createdId!, `${AUTOMATION_REASON_PREFIX}APPROVE-008 thu tu huy`)).not.toBeNull();
    expect((await api.getDetail(created.createdId!)).approvalStatus).toBe('APPROVED');
  });
});

/** T7 dau tien sau hom nay (toi da 8 tuan) ma account test chua co don hieu luc; het thi skip. */
async function firstFreeSaturday(api: RonApiClient): Promise<IsoDate> {
  let day = shiftDays(todayInVietnam(), 1);
  while (new Date(`${day}T00:00:00Z`).getUTCDay() !== 6) day = shiftDays(day, 1);
  const occupied = await api.occupiedDays(day, shiftDays(day, 7 * 7));
  for (let week = 0; week < 8; week++, day = shiftDays(day, 7)) if (!occupied.has(day)) return day;
  test.skip(true, 'Account test da co don hieu luc o ca 8 Thu 7 toi');
  throw new Error('unreachable'); // test.skip(true) da nem loi skip
}
