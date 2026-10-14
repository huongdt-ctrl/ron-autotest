import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { createPendingLeave, skipIfOccupied } from '../../fixtures/request-test-helpers';
import { LeaveRequestFormPage, type LeavePeriod } from '../../pages/leave-request-form-page';
import { addWorkingDays, todayInVietnam } from '../../utils/working-days';

// Don nghi phep - quy tac server chan (doc 05). TAO DON THAT tren account test; don tao thanh cong
// duoc fixture createdRequests tu huy. Ngay da co don hieu luc -> skip.

const APPROVER = process.env.RON_APPROVER || '';
const MONTHLY_FEMALE_LEAVE = 'Nghỉ định kỳ tháng (Nhân viên nữ)';

test.describe('Don nghi phep - quy tac server chan', () => {
  test.skip(!APPROVER, 'Chua set RON_APPROVER (nguoi kiem duyet co tham quyen TBP) trong .env');

  let form: LeaveRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new LeaveRequestFormPage(employeePage);
  });

  test.afterEach(async () => {
    await form.close();
  });

  // QD-04-02 muc 2.9: nghi dinh ky 4 gio/thang chi cho nhan vien nu. Dropdown cua nhan vien nam van co
  // option nay; server chan bang message "thieu quy" (doc 05 - message chua noi ro ly do).
  test('[RON-LEAVE-014] Nhan vien nam chon Nghi dinh ky thang (Nhan vien nu) thi bi chan NOT_ENOUGH_MONTHLY_BONUS_TIME', async ({
    api,
    createdRequests,
  }) => {
    // Arrange
    test.skip((await api.userInfo()).gender !== 'MALE', 'Case chi danh cho account test la nam');
    const periods: LeavePeriod[] = [{ day: addWorkingDays(todayInVietnam(), 10), from: '10:00', to: '11:00' }];
    await skipIfOccupied(api, periods);
    await form.open();
    await form.fill({ periods, leaveType: MONTHLY_FEMALE_LEAVE, approver: APPROVER, reason: `${AUTOMATION_REASON_PREFIX}LEAVE-014` });

    // Act
    const result = await form.submit();
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('NOT_ENOUGH_MONTHLY_BONUS_TIME');
    expect(result.toasts).toContain('Thời gian nghỉ định kỳ còn lại không đủ!');
  });

  test('[RON-LEAVE-015] Nop don trung khoang thoi gian voi don Cho xu ly thi bi chan REGISTERED_OVERLAP_ERROR', async ({
    api,
    employeePage,
    createdRequests,
  }) => {
    // Arrange: don 1 ca ngay, Cho xu ly
    const leave = await createPendingLeave(employeePage, api, APPROVER, 'LEAVE-015');
    createdRequests.add(leave.id);
    await form.open();
    await form.fill({
      periods: [{ day: leave.day, from: '08:00', to: '12:00' }],
      approver: APPROVER,
      reason: `${AUTOMATION_REASON_PREFIX}LEAVE-015 trung`,
    });

    // Act
    const result = await form.submit();
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('REGISTERED_OVERLAP_ERROR');
    expect(result.toasts).toContain('Khoảng thời gian đăng ký hiện tại bị trùng với khoảng thời gian đăng ký trước đó!');
    expect((await api.getDetail(leave.id)).approvalStatus).toBe('PENDING');
  });
});
