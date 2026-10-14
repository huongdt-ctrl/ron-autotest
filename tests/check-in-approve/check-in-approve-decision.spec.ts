import type { Page } from '@playwright/test';
import { AUTOMATION_REASON_PREFIX, APPROVE_WRITES_ENABLED, expect, TBP_USERNAME, test } from '../../fixtures/approver-session-fixture';
import { createPendingCheckIn } from '../../fixtures/request-test-helpers';
import {
  APPROVE_SUCCESS_TOAST,
  ApproveDecisionModal,
  CHECK_IN_DECISION,
  DECISION_CONFIRM_TEXT,
  DECISION_LABELS,
  REJECT_SUCCESS_TOAST,
} from '../../pages/approve-decision-modal';
import { CheckInApproveListPage } from '../../pages/check-in-approve-list-page';
import { STATUS_LABELS, toDisplayDate } from '../../pages/work-time-request-list-page';
import { REQUIRED_FIELD_ERROR } from '../../pages/work-time-request-modals';
import type { CheckInRegister, RonApiClient } from '../../utils/ron-api-client';

// Man "Phe duyet don cham cong" (doc 15), role TBP - quyet dinh Chap thuan / Tu choi.
// Nhan vien (RON_USERNAME) tao don cham cong that (form 10, ngay da qua trong thang, kem anh), chon TBP
// (RON_TBP_USERNAME) lam nguoi kiem duyet; TBP xu ly trong context rieng. Guard chi cho TBP gui quyet dinh
// cho dung don test da allow(id, 'checkIn').
// - Don con Cho xu ly: fixture checkInCleanup (nhan vien) tu huy truoc + sau test.
// - Don da co quyet dinh (Chap thuan -> Cho xac nhan, Tu choi): nhan vien KHONG tu huy duoc (INVALID_STATUS,
//   do 2026-10-13), don chiem ngay + han muc 5 don/thang vinh vien -> chi case @approve-writes, chay tay
//   voi RON_ALLOW_APPROVE=1. Chap thuan con co the bi Nhan su xac nhan -> cong vao gio cong cua account test.
// Het ngay trong / het han muc thang (vd ngay 01 cua thang) -> skip.

const CLEANUP_NOTE = `${AUTOMATION_REASON_PREFIX}CHECKIN-APPROVE tu huy`;

test.describe('Phe duyet don cham cong (TBP) - quyet dinh', () => {
  test.skip(!TBP_USERNAME || !process.env.RON_TBP_PASSWORD, 'Chua set RON_TBP_USERNAME / RON_TBP_PASSWORD trong .env');

  let screen: CheckInApproveListPage;
  let decision: ApproveDecisionModal;

  test.beforeEach(async ({ approverPage, checkInCleanup }) => {
    void checkInCleanup; // dang ky don dep don cham cong AUTOTEST_ cho moi test
    screen = new CheckInApproveListPage(approverPage);
    decision = new ApproveDecisionModal(approverPage, CHECK_IN_DECISION);
  });

  test.afterEach(async () => {
    await decision?.close(); // undefined neu fixture loi truoc beforeEach
  });

  /** Nhan vien tao don Cho xu ly; TBP mo danh sach dung ngay cua don, tra ve don + dong cua don. */
  async function createAndOpenRowAsTbp(employeePage: Page, api: RonApiClient, tag: string) {
    const checkIn = await createPendingCheckIn(employeePage, api, TBP_USERNAME, tag);
    await screen.goto({ page: 1, size: 20, from: checkIn.day, to: checkIn.day, status: 'null', username: 'null' });
    const row = screen.rowByReason(checkIn.reason!);
    await expect(row).toHaveCount(1);
    return { checkIn, row };
  }

  async function statusOf(api: RonApiClient, checkIn: CheckInRegister) {
    return (await api.listMyCheckInRegisters(checkIn.day, checkIn.day)).find((r) => r.id === checkIn.id);
  }

  test('[RON-CHECKIN-APPROVE-005] Don moi cua nhan vien: hien o TBP, chi tiet + anh, mac dinh Chap thuan va khoa Ghi chu', async ({
    api,
    employeePage,
  }) => {
    // Arrange
    const { checkIn, row } = await createAndOpenRowAsTbp(employeePage, api, 'CHECKIN-APPROVE-005');
    await expect(screen.cell(row, 'Người đăng ký')).toHaveText(process.env.RON_USERNAME!);
    await expect(screen.cell(row, 'Ngày')).toHaveText(checkIn.day); // yyyy-MM-dd (diem bat thuong 6)
    await expect(screen.cell(row, 'Trạng thái')).toHaveText(STATUS_LABELS.PENDING);

    // Act 1: mo modal
    await decision.open(screen.actionButton(row));

    // Assert 1: noi dung chi tiet, anh bang chung, gia tri mac dinh (diem bat thuong 1)
    expect(await decision.details()).toMatchObject({
      'Ngày': toDisplayDate(checkIn.day),
      'Hình thức làm việc': 'Làm việc tại văn phòng',
      'Thời gian checkin': '08:00',
      'Thời gian checkout': '12:00',
      'Lý do': checkIn.reason,
      'Trạng thái': STATUS_LABELS.PENDING,
    });
    await expect(decision.evidenceImages()).toHaveCount(1);
    await expect(decision.decisionValue).toHaveText(DECISION_LABELS.approve);
    await expect(decision.noteInput).toBeDisabled(); // diem bat thuong 2: khac man 14

    // Act 2: doi sang Tu choi -> Ghi chu mo khoa; ✓ -> popup "Chu y" -> ✕
    await decision.chooseDecision('reject');
    await expect(decision.noteInput).toBeEnabled();
    await decision.clickAccept();
    await expect(decision.confirmPopup).toContainText(DECISION_CONFIRM_TEXT);
    await decision.dismissConfirmPopup();

    // Assert 2: quay lai modal, don van Cho xu ly (guard bat neu co quyet dinh bi gui)
    await expect(decision.modal).toBeVisible();
    expect((await statusOf(api, checkIn))?.approvalStatus).toBe('PENDING');
  });

  test('[RON-CHECKIN-APPROVE-006] Tu choi de trong Ghi chu: bao loi bat buoc, khong gui quyet dinh', async ({ api, employeePage }) => {
    // Arrange: KHONG allow() -> neu client van gui quyet dinh, guard chan va test fail o teardown
    const { checkIn, row } = await createAndOpenRowAsTbp(employeePage, api, 'CHECKIN-APPROVE-006');
    await decision.open(screen.actionButton(row));
    await decision.chooseDecision('reject');

    // Act
    const result = await decision.submit();

    // Assert
    expect(result.httpStatus, 'Client phai chan, khong gui quyet dinh').toBeNull();
    await expect(decision.fieldError(REQUIRED_FIELD_ERROR)).toBeVisible();
    expect((await statusOf(api, checkIn))?.approvalStatus).toBe('PENDING');
  });

  test('[RON-CHECKIN-APPROVE-007] @approve-writes Chap thuan: gui agree=true khong note, don sang Cho xac nhan, mo lai chi xem, nhan vien khong tu huy duoc', async ({
    api,
    employeePage,
    approverPage,
    approvalGuard,
  }) => {
    test.skip(!APPROVE_WRITES_ENABLED, 'Don Cho xac nhan khong huy duoc va chiem han muc thang -> chi chay tay voi RON_ALLOW_APPROVE=1');
    test.info().annotations.push({
      type: 'known-issue',
      description: 'Don Cho xac nhan: icon 🗑 van cursor pointer nhung API tu huy tra INVALID_STATUS (doc 15)',
    });

    // Arrange
    const { checkIn, row } = await createAndOpenRowAsTbp(employeePage, api, 'CHECKIN-APPROVE-007');
    approvalGuard.allow(checkIn.id, 'checkIn');
    const [year, month] = checkIn.day.split('-').map(Number);
    const hoursOfDay = async () => (await api.monthlyWorkingHours(year, month)).find((d) => d.date === checkIn.day);
    const hoursBefore = await hoursOfDay();
    await decision.open(screen.actionButton(row));
    const request = approverPage.waitForRequest(
      (r) => r.method() === 'POST' && CHECK_IN_DECISION.decisionApi.test(new URL(r.url()).pathname),
    );

    // Act: giu Quyet dinh mac dinh (Chap thuan)
    const result = await decision.submit();

    // Assert: payload + server
    expect((await request).postDataJSON()).toEqual({ agree: true });
    expect(result.httpStatus).toBe(200);
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain(APPROVE_SUCCESS_TOAST); // diem bat thuong 3: trang thai thuc la Cho xac nhan
    await expect(decision.modal).toBeHidden();
    expect((await statusOf(api, checkIn))?.approvalStatus).toBe('WAIT_CONFIRM');

    // Assert: TBP - danh sach + mo lai chi doc (khong khoi Quyet dinh, khong nut ✓)
    await expect(screen.cell(row, 'Trạng thái')).toHaveText(STATUS_LABELS.WAIT_CONFIRM);
    await decision.open(screen.actionButton(row));
    expect((await decision.details())['Trạng thái']).toBe(STATUS_LABELS.WAIT_CONFIRM);
    await expect(decision.decisionCombo).toHaveCount(0);
    await expect(decision.acceptButton).toHaveCount(0);

    // Assert: TBP duyet (cap 1) chua cong gio - cho Nhan su xac nhan (QD 1.7, doc 15 Dependency)
    expect(await hoursOfDay()).toEqual(hoursBefore);

    // Act + Assert: nhan vien tu huy don Cho xac nhan -> server chan (do 2026-10-13, doc 15)
    expect(await api.selfCancelCheckInRegister(checkIn.id, CLEANUP_NOTE)).toBe('INVALID_STATUS');
    expect((await statusOf(api, checkIn))?.approvalStatus).toBe('WAIT_CONFIRM');
  });

  test('[RON-CHECKIN-APPROVE-008] @approve-writes Tu choi co Ghi chu: toast, Tu choi o ca 2 phia, nhan vien khong huy duoc', async ({
    api,
    employeePage,
    approvalGuard,
  }) => {
    test.skip(!APPROVE_WRITES_ENABLED, 'Don Tu choi khong huy duoc va chiem han muc thang -> chi chay tay voi RON_ALLOW_APPROVE=1');

    // Arrange
    const { checkIn, row } = await createAndOpenRowAsTbp(employeePage, api, 'CHECKIN-APPROVE-008');
    approvalGuard.allow(checkIn.id, 'checkIn');
    const note = `${AUTOMATION_REASON_PREFIX}CHECKIN-APPROVE-008 tu choi`;
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
    expect(await statusOf(api, checkIn)).toMatchObject({ approvalStatus: 'REJECTED', note });

    // Assert: TBP - danh sach + mo lai chi doc, co dong Ghi chu
    await expect(screen.cell(row, 'Trạng thái')).toHaveText(STATUS_LABELS.REJECTED);
    await decision.open(screen.actionButton(row));
    expect((await decision.details())['Ghi chú']).toBe(note);
    await expect(decision.decisionCombo).toHaveCount(0);
    await expect(decision.acceptButton).toHaveCount(0);

    // Assert: nhan vien khong tu huy duoc don Tu choi
    // Server co the tu choi bang errorCode (HTTP 200) hoac HTTP loi -> ca 2 deu tinh la "khong huy duoc"
    const cancelError = await api.selfCancelCheckInRegister(checkIn.id, CLEANUP_NOTE).catch((e: Error) => e.message);
    expect(cancelError, 'Don Tu choi khong duoc tu huy').not.toBeNull();
    expect((await statusOf(api, checkIn))?.approvalStatus).toBe('REJECTED');
  });
});
