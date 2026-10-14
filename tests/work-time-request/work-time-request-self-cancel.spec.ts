import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { createPendingLeave, skipIfOccupied, type CreatedLeave } from '../../fixtures/request-test-helpers';
import { STATUS_LABELS, WorkTimeRequestListPage } from '../../pages/work-time-request-list-page';
import { CANCEL_SUCCESS_TOAST, CancelRequestModal, REQUIRED_FIELD_ERROR, RequestDetailModal } from '../../pages/work-time-request-modals';
import { LeaveRequestFormPage } from '../../pages/leave-request-form-page';
import { addWorkingDays, todayInVietnam } from '../../utils/working-days';

// Man "Don dang ky" (doc 04) - nhan vien tu huy don Cho xu ly (QD-04-02 muc 2.16).
// Moi test tu tao 1 don nghi khong huong luong ca ngay (khong tru quy phep), cach hom nay 10 ngay LV
// (du bao truoc muc 2.15). Ngay da co don hieu luc -> skip. Don con Cho xu ly duoc fixture tu huy.

const APPROVER = process.env.RON_APPROVER || '';

test.describe('Don dang ky - tu huy don Cho xu ly', () => {
  test.skip(!APPROVER, 'Chua set RON_APPROVER (nguoi kiem duyet co tham quyen TBP) trong .env');

  let screen: WorkTimeRequestListPage;
  let cancelModal: CancelRequestModal;

  test.beforeEach(async ({ employeePage }) => {
    screen = new WorkTimeRequestListPage(employeePage);
    cancelModal = new CancelRequestModal(employeePage);
  });

  test.afterEach(async () => {
    await cancelModal.close();
  });

  /** Mo danh sach dung ngay cua don, tra ve dong cua don. */
  async function openRow(leave: CreatedLeave) {
    await screen.goto({ page: 1, size: 20, type: 'null', status: 'null', from: leave.day, to: leave.day });
    const row = screen.rowByReason(leave.reason);
    await expect(row).toHaveCount(1);
    return row;
  }

  // Doc 04 diem bat thuong 1: popup "Chu y" hien TRUOC validation.
  test('[RON-REQLIST-012] Huy don de trong li do: popup Chu y hien truoc, sau do bao loi bat buoc, khong gui request', async ({
    api,
    employeePage,
    createdRequests,
  }) => {
    // Arrange
    const leave = await createPendingLeave(employeePage, api, APPROVER, 'REQLIST-012');
    createdRequests.add(leave.id); // test khong huy -> fixture don dep
    const row = await openRow(leave);
    await expect(row.locator('td').nth(4)).toHaveText(STATUS_LABELS.PENDING);
    await screen.cancelButton(row).click();
    await expect(cancelModal.modal).toBeVisible();

    // Act 1: bam ✓ roi ✕ tren popup -> quay lai modal
    await cancelModal.clickAccept();
    await cancelModal.dismissConfirmPopup();

    // Assert 1
    await expect(cancelModal.modal).toBeVisible();
    await expect(cancelModal.fieldError(REQUIRED_FIELD_ERROR)).toBeHidden();

    // Act 2: bam ✓ + xac nhan popup voi li do trong
    const result = await cancelModal.submit();

    // Assert 2
    expect(result.httpStatus, 'Client phai chan, khong gui selfCancel').toBeNull();
    await expect(cancelModal.fieldError(REQUIRED_FIELD_ERROR)).toBeVisible();
    expect((await api.getDetail(leave.id)).approvalStatus).toBe('PENDING');
  });

  test('[RON-REQLIST-013] Huy don co li do: toast Huy thanh cong, trang thai Huy, Ghi chu hien li do huy, 🗑 bi khoa', async ({
    api,
    employeePage,
  }) => {
    // Arrange: KHONG add vao createdRequests - don da huy ma fixture huy lai se bao loi.
    // Test fail truoc khi huy -> fixture van quet don AUTOTEST_ Cho xu ly va huy.
    const leave = await createPendingLeave(employeePage, api, APPROVER, 'REQLIST-013');
    const cancelNote = `${AUTOMATION_REASON_PREFIX}REQLIST-013 tu huy`;
    const row = await openRow(leave);
    await screen.cancelButton(row).click();
    await expect(cancelModal.modal).toBeVisible();
    await cancelModal.reasonInput.fill(cancelNote);

    // Act
    const result = await cancelModal.submit();

    // Assert: server
    expect(result.httpStatus).toBe(200);
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain(CANCEL_SUCCESS_TOAST);
    await expect(cancelModal.modal).toBeHidden();
    const detail = await api.getDetail(leave.id);
    expect(detail.approvalStatus).toBe('CANCELED');
    expect(detail.note).toBe(cancelNote);

    // Assert: UI danh sach + chi tiet
    await expect(row.locator('td').nth(4)).toHaveText(STATUS_LABELS.CANCELED);
    const detailModal = new RequestDetailModal(employeePage);
    await detailModal.open(screen.detailButton(row));
    expect((await detailModal.details())['Ghi chú']).toBe(cancelNote);
    await detailModal.close();
    await screen.cancelButton(row).click({ force: true });
    await employeePage.waitForTimeout(1_000); // cho 1 nhip de chac chan modal khong mo tre
    await expect(cancelModal.modal).toBeHidden();
  });

  // Doc 04 diem bat thuong 3: Thong ke ghi "da nghi" nhung tinh ca don Cho xu ly; don Huy bi tru ra.
  // Test ghi lai HANH VI HIEN TAI; neu PO chot chi tinh don da duyet -> doi assertion sau khi tao.
  test('[RON-REQLIST-016] Thong ke Nghi khong huong luong tang ngay khi tao don Cho xu ly, giam lai khi tu huy', async ({
    api,
    employeePage,
  }) => {
    test.info().annotations.push({ type: 'known-issue', description: 'Thong ke "da nghi" tinh ca don chua duyet (doc 04 diem bat thuong 3)' });

    // Arrange: nua ngay 08:00-12:00 (240 phut), bao truoc 2 ngay LV (QD 2.15); API summary chi tinh thang hien tai
    const day = addWorkingDays(todayInVietnam(), 2);
    test.skip(day.slice(0, 7) !== todayInVietnam().slice(0, 7), 'Ngay du bao truoc roi sang thang sau');
    await skipIfOccupied(api, [{ day, from: '08:00', to: '12:00' }]);
    const before = (await api.workTimeSummary()).unpaidDayOffTime;
    const form = new LeaveRequestFormPage(employeePage);
    await form.open();
    await form.fill({ periods: [{ day, from: '08:00', to: '12:00' }], approver: APPROVER, reason: `${AUTOMATION_REASON_PREFIX}REQLIST-016 ${Date.now()}` });

    // Act 1: tao don (khong add vao createdRequests: test tu huy; fail giua chung -> fixture quet don sot theo tien to)
    const created = await form.submit();
    await form.close();

    // Assert 1
    expect(created.createdId, JSON.stringify(created)).not.toBeNull();
    expect((await api.workTimeSummary()).unpaidDayOffTime).toBe(before + 240);

    // Act 2: tu huy
    expect(await api.selfCancel(created.createdId!, `${AUTOMATION_REASON_PREFIX}REQLIST-016 tu huy`)).toBeNull();

    // Assert 2
    expect((await api.workTimeSummary()).unpaidDayOffTime).toBe(before);
  });
});
