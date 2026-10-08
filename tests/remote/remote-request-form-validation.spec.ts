import { expect, test } from '../../fixtures/employee-session-fixture';
import { RemoteRequestFormPage } from '../../pages/remote-request-form-page';

// Validation phia client cua form "Don xin remote". Khong tao du lieu: request khong duoc gui.

const REQUIRED = 'Không được để trống trường này!';
const INVALID_TOAST = 'Thông tin đăng ký không hợp lệ, vui lòng kiểm tra lại!';

test.describe('Don remote - validation form', () => {
  let form: RemoteRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new RemoteRequestFormPage(employeePage);
    await form.open();
  });

  test.afterEach(async () => {
    await form.close();
  });

  test('[RON-REMOTE-101] Submit form rong thi bao loi bat buoc va khong gui request @smoke', async () => {
    // Act
    const result = await form.submit();

    // Assert
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    // Thoi gian, Nguoi kiem duyet, Kenh giao tiep, So dien thoai
    await expect(form.fieldError(REQUIRED)).toHaveCount(4);
    expect(result.toasts).toContain(INVALID_TOAST);
  });

  test('[RON-REMOTE-102] Chon Khong co ke hoach thi hien Li do bat buoc va Anh bang chung (QD-04-02 muc 3.10)', async () => {
    // Act
    await form.choosePlanned(false);
    const result = await form.submit();

    // Assert
    await expect(form.reasonInput).toBeVisible();
    await expect(form.modal.getByText('Ảnh bằng chứng')).toBeVisible();
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    // 4 truong nhu 101 + Li do; Anh bang chung khong bat buoc
    await expect(form.fieldError(REQUIRED)).toHaveCount(5);
  });
});
