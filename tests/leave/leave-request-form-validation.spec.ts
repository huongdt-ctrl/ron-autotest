import { expect, test } from '../../fixtures/employee-session-fixture';
import { LeaveRequestFormPage } from '../../pages/leave-request-form-page';
import { pickDatepickerDay, selectReactOption } from '../../pages/ron-modal-form-controls';
import { addWorkingDays, todayInVietnam } from '../../utils/working-days';

const INSURANCE_LEAVE = 'Nghỉ theo chế độ bảo hiểm';
/** Hinh thuc nghi che do (combobox thu 4, chi hien khi Hinh thuc = Bao hiem) - do 2026-10-13. */
const INSURANCE_CASES = [
  'Vợ sinh thường (5 ngày)',
  'Vợ sinh mổ (7 ngày)',
  'Vợ sinh đôi sinh thường (10 ngày)',
  'Vợ sinh đôi sinh mổ (14 ngày)',
  'Người lao động nghỉ ốm đau có thời gian đóng BHXH dưới 15 năm (30 ngày)',
  'Nghỉ chăm con ốm (trường hợp con dưới 3 tuổi) (20 ngày)',
  'Nghỉ chăm con ốm (trường hợp con đủ 3 tuổi đến dưới 7 tuổi) (15 ngày)',
];

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

  test('[RON-LEAVE-103] Mac dinh Co ke hoach + Nghi huong luong; chon Bao hiem thi hien them Hinh thuc nghi che do, doi lai thi an', async ({ employeePage }) => {
    // Arrange
    const combos = form.modal.locator('input[role="combobox"]'); // Ke hoach, Hinh thuc, Nguoi kiem duyet
    await expect(form.modal.locator('[class*="singleValue"]')).toHaveText(['Có kế hoạch', 'Nghỉ hưởng lương']);
    await expect(combos).toHaveCount(3);

    // Act
    await selectReactOption(employeePage, form.modal, 1, INSURANCE_LEAVE);

    // Assert: combobox thu 4 = Hinh thuc nghi che do
    await expect(combos).toHaveCount(4);
    await combos.nth(2).focus();
    await employeePage.keyboard.press('ArrowDown');
    await expect(employeePage.locator('[role="option"], [id*="-option-"]')).toHaveText(INSURANCE_CASES);
    await employeePage.keyboard.press('Escape');

    // Act + Assert: doi sang hinh thuc khac thi field bien mat
    await selectReactOption(employeePage, form.modal, 1, 'Nghỉ không hưởng lương');
    await expect(combos).toHaveCount(3);
  });

  test('[RON-LEAVE-104] Chon ngay nhung chua chon gio thi bao loi khoang thoi gian va khong gui request', async ({ employeePage }) => {
    // Arrange
    await pickDatepickerDay(employeePage, form.modal.locator('input[placeholder="Chọn ngày"]').first(), addWorkingDays(todayInVietnam(), 10));

    // Act
    const result = await form.submit();

    // Assert
    expect(result.httpStatus, 'Request tao don khong duoc gui').toBeNull();
    await expect(form.fieldError('Không được để trống các khoảng thời gian!')).toBeVisible();
    // Nguoi kiem duyet, Li do, Bien phap khac phuc
    await expect(form.fieldError('Không được để trống trường này!')).toHaveCount(3);
    expect(result.toasts).toContain('Thông tin đăng ký không hợp lệ, vui lòng kiểm tra lại!');
  });
});
