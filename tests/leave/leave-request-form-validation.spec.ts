import { expect, test } from '../../fixtures/employee-session-fixture';
import { LeaveRequestFormPage } from '../../pages/leave-request-form-page';

// Validation phia client cua form nghi phep. Khong tao du lieu: request khong duoc gui.

test.describe('Don nghi phep - validation form', () => {
  let form: LeaveRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new LeaveRequestFormPage(employeePage);
    await form.open();
  });

  test.afterEach(async () => {
    await form.close();
  });

  test('[RON-LEAVE-101] Submit form rong thi bao loi bat buoc va khong gui request @smoke', async () => {
    // Act
    const result = await form.submit();

    // Assert
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    // Thoi gian, Nguoi kiem duyet, Li do, Bien phap khac phuc
    await expect(form.fieldError('Không được để trống trường này!')).toHaveCount(4);
    expect(result.toasts).toContain('Thông tin đăng ký không hợp lệ, vui lòng kiểm tra lại!');
  });

  test('[RON-LEAVE-102] Form cho toi da 10 khoang thoi gian (QD-04-02 muc 2.16: > 10 ngay LV phai email)', async () => {
    // Arrange: form mo san 1 khoang

    // Act
    await form.addPeriods(9);

    // Assert
    await expect(form.modal.getByText('Khoảng thời gian 10', { exact: true })).toBeVisible();
    await expect(form.addPeriodButton).toBeHidden();
  });
});
