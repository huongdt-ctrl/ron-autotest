import { expect, test } from '../../fixtures/employee-session-fixture';
import { OvertimeRequestFormPage } from '../../pages/overtime-request-form-page';
import { addWorkingDays, todayInVietnam } from '../../utils/working-days';

// Validation phia client cua form "Don xin OT". Khong tao du lieu: request khong duoc gui.

const REQUIRED = 'Không được để trống trường này!';
const EMPTY_INTERVAL = 'Không được để trống các khoảng thời gian!';
const INVALID_TOAST = 'Thông tin đăng ký không hợp lệ, vui lòng kiểm tra lại!';
const REASON_MAX_LENGTH = 500;

test.describe('Don OT - validation form', () => {
  let form: OvertimeRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new OvertimeRequestFormPage(employeePage);
    await form.open();
  });

  test.afterEach(async () => {
    await form.close();
  });

  test('[RON-OT-101] Submit form rong thi bao loi bat buoc va khong gui request @smoke', async () => {
    // Act
    const result = await form.submit();

    // Assert
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    // Thoi gian, Nguoi kiem duyet, Li do (doc 07)
    await expect(form.fieldError(REQUIRED)).toHaveCount(3);
    expect(result.toasts).toContain(INVALID_TOAST);
  });

  test('[RON-OT-102] Them khoang thoi gian thu 2 nhung bo trong thi bao loi khoang thoi gian', async () => {
    // Arrange: chi 1 khoang trong -> loi chung REQUIRED (nhu 101); tu 2 khoang tro len moi ra EMPTY_INTERVAL (do 2026-10-08)
    await form.pickDay(addWorkingDays(todayInVietnam(), 1));
    await form.addIntervalButton.click();

    // Act
    const result = await form.submit();

    // Assert
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    await expect(form.fieldError(EMPTY_INTERVAL)).toBeVisible();
  });

  test('[RON-OT-103] Li do bi cat o 500 ky tu (maxlength)', async () => {
    // Act
    await form.reasonInput.fill('a'.repeat(REASON_MAX_LENGTH + 1));

    // Assert
    await expect(form.reasonInput).toHaveValue('a'.repeat(REASON_MAX_LENGTH));
  });
});
