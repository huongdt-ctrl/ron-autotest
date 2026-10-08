import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { CheckInRegisterFormPage } from '../../pages/check-in-register-form-page';
import { todayInVietnam } from '../../utils/working-days';

// Validation phia client cua form "Don cham cong". Khong tao du lieu: request khong duoc gui.

const APPROVER = process.env.RON_APPROVER || '';

test.describe('Don cham cong - validation form', () => {
  let form: CheckInRegisterFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new CheckInRegisterFormPage(employeePage);
    await form.open();
  });

  test.afterEach(async () => {
    if (!form) return; // fixture dang nhap loi truoc khi beforeEach tao form
    await form.page.keyboard.press('Escape'); // dong datepicker neu dang mo
    await form.close();
  });

  test('[RON-CHECKIN-101] Submit form rong thi bao loi bat buoc va khong gui request @smoke', async () => {
    // Act
    const result = await form.submit();

    // Assert
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    // Nguoi kiem duyet, Thoi gian, Li do, Anh bang chung (QD-04-02 muc 1.7: du 3 noi dung + nguoi duyet)
    await expect(form.fieldError('Không được để trống trường này!')).toHaveCount(4);
    expect(result.toasts).toContain('Thông tin đăng ký không hợp lệ, vui lòng kiểm tra lại!');
  });

  test('[RON-CHECKIN-102] Datepicker chi cho chon ngay da qua trong thang, khoa hom nay va tuong lai', async () => {
    // Arrange
    const dayOfMonth = Number(todayInVietnam().slice(8, 10));
    test.skip(dayOfMonth === 1, 'Ngay 1: khong con ngay da qua trong thang, datepicker co the mo o thang truoc');
    const pastDays = Array.from({ length: dayOfMonth - 1 }, (_, i) => String(i + 1));

    // Act
    await form.openDatepicker();

    // Assert
    const enabled = form.datepickerDays().and(form.page.locator(':not(.react-datepicker__day--disabled)'));
    await expect(enabled).toHaveText(pastDays);
    await expect(form.page.locator('.react-datepicker__day--today')).toHaveClass(/react-datepicker__day--disabled/);
  });

  test('[RON-CHECKIN-103] Li do toi da 500 ky tu, phan thua bi cat', async () => {
    // Act
    await form.reasonInput.fill('a'.repeat(501));

    // Assert
    await expect(form.reasonInput).toHaveValue('a'.repeat(500));
  });

  test('[RON-CHECKIN-104] Anh bang chung chi nhan file anh (QD-04-02 muc 1.7)', async () => {
    // Assert
    await expect(form.evidenceInput).toHaveAttribute('accept', 'image/*');
  });

  test('[RON-CHECKIN-105] Chon gio bat dau thi gio ket thuc khoa moi moc truoc hoac bang gio bat dau', async () => {
    // Act
    const disabled = await form.disabledEndTimesAfterStart('10:00');

    // Assert
    expect(disabled).toEqual(expect.arrayContaining(['00:00', '09:00', '09:55', '10:00']));
    expect(disabled).not.toContain('10:05');
  });

  // checkInCleanup: neu client lo gui request (regression) thi don AUTOTEST_ RON- van duoc tu huy.
  test('[RON-CHECKIN-106] Dinh kem file PDF thi bi bo qua, submit bao thieu anh va khong gui request', async ({ checkInCleanup }) => {
    void checkInCleanup;
    // Arrange: du moi truong hop le tru anh -> chi con 1 loi bat buoc la Anh bang chung
    const today = todayInVietnam();
    test.skip(today.endsWith('-01') || !APPROVER, 'Can 1 ngay da qua trong thang va RON_APPROVER');
    const yesterday = `${today.slice(0, 8)}${String(Number(today.slice(8, 10)) - 1).padStart(2, '0')}`;
    const reason = `${AUTOMATION_REASON_PREFIX}CHECKIN-106`;
    await form.fill({ approver: APPROVER, day: yesterday, checkIn: '08:00', checkOut: '12:00', reason, withEvidence: false });

    // Act
    await form.evidenceInput.setInputFiles({ name: 'AUTOTEST_evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    const result = await form.submit();

    // Assert
    await expect(form.modal.getByText('AUTOTEST_evidence.pdf')).toHaveCount(0);
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    await expect(form.fieldError('Không được để trống trường này!')).toHaveCount(1);
    expect(result.toasts).toContain('Thông tin đăng ký không hợp lệ, vui lòng kiểm tra lại!');
  });
});
