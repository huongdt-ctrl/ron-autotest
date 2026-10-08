import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { allDays, skipIfOccupied } from '../../fixtures/request-test-helpers';
import { LeaveRequestFormPage, type LeavePeriod } from '../../pages/leave-request-form-page';
import {
  addWorkingDays,
  isWorkingDay,
  lastWorkingDayOfPreviousMonth,
  todayInVietnam,
  type IsoDate,
} from '../../utils/working-days';

// QD-04-02 muc 2.15: thoi gian bao truoc toi thieu (ngay LV) theo do dai nghi, don "Co ke hoach".
// Moi nguong 2 case: dung bien (tao duoc) va thieu 1 ngay LV (server chan INVALID_PLANNED_REGISTER).
// Ngay tinh dong theo ngay chay; ngay da co don hieu luc -> skip (tranh REGISTERED_OVERLAP_ERROR).
// Don tao thanh cong duoc fixture tu huy sau moi test.

const APPROVER = process.env.RON_APPROVER || '';

interface NoticeBand {
  label: string;
  requiredWorkingDays: number;
  periodsFrom: (start: IsoDate) => LeavePeriod[];
}


const BANDS: NoticeBand[] = [
  // Khung cuoi ngay de case 'thieu' (bat dau hom nay) it phu thuoc gio chay.
  { label: 'duoi 4 gio', requiredWorkingDays: 1, periodsFrom: (d) => [{ day: d, from: '16:00', to: '17:00' }] },
  { label: '4 gio den duoi 1 ngay', requiredWorkingDays: 2, periodsFrom: (d) => [{ day: d, from: '08:00', to: '12:00' }] },
  { label: '1 den duoi 2 ngay', requiredWorkingDays: 3, periodsFrom: (d) => allDays(d, 1) },
  { label: '2 den duoi 3 ngay', requiredWorkingDays: 5, periodsFrom: (d) => allDays(d, 2) },
  { label: '3 den duoi 4 ngay', requiredWorkingDays: 10, periodsFrom: (d) => allDays(d, 3) },
  { label: '4 den 10 ngay', requiredWorkingDays: 15, periodsFrom: (d) => allDays(d, 4) },
];

test.describe('Don nghi phep - bao truoc theo QD-04-02 muc 2.15', () => {
  test.skip(!APPROVER, 'Chua set RON_APPROVER (nguoi kiem duyet co tham quyen TBP) trong .env');

  let form: LeaveRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new LeaveRequestFormPage(employeePage);
  });

  test.afterEach(async () => {
    await form.close();
  });

  BANDS.forEach((band, index) => {
    const caseNo = String(index * 2 + 1).padStart(3, '0');
    const nextNo = String(index * 2 + 2).padStart(3, '0');

    test(`[RON-LEAVE-${caseNo}] Nghi ${band.label}, bao truoc dung ${band.requiredWorkingDays} ngay LV thi tao duoc`, async ({ api, createdRequests }) => {
      // Arrange
      const periods = band.periodsFrom(addWorkingDays(todayInVietnam(), band.requiredWorkingDays));
      await skipIfOccupied(api, periods);
      await form.open();
      await form.fill({ periods, approver: APPROVER, reason: `${AUTOMATION_REASON_PREFIX}LEAVE-${caseNo}` });

      // Act
      const result = await form.submit();
      if (result.createdId) createdRequests.add(result.createdId);

      // Assert
      expect(result.errorCode, JSON.stringify(result)).toBeNull();
      expect(result.createdId).not.toBeNull();
      expect(result.toasts).toContain('Tạo thành công!');
      const created = await api.getById(result.createdId!, periods[0].day, periods[periods.length - 1].day);
      expect(created?.approvalStatus).toBe('PENDING');
    });

    test(`[RON-LEAVE-${nextNo}] Nghi ${band.label}, bao truoc thieu 1 ngay LV thi bi chan`, async ({ api, createdRequests }) => {
      // Arrange
      const start = addWorkingDays(todayInVietnam(), band.requiredWorkingDays - 1);
      test.skip(!isWorkingDay(start), 'Hom nay khong phai ngay LV, khong dung duoc case bien');
      const periods = band.periodsFrom(start);
      await skipIfOccupied(api, periods);
      await form.open();
      await form.fill({ periods, approver: APPROVER, reason: `${AUTOMATION_REASON_PREFIX}LEAVE-${nextNo}` });

      // Act
      const result = await form.submit();
      if (result.createdId) createdRequests.add(result.createdId);

      // Assert
      expect(result.errorCode, JSON.stringify(result)).toBe('INVALID_PLANNED_REGISTER');
      expect(result.toasts).toContain('Kế hoạch đăng ký không hợp lệ!');
    });
  });

  // QD-04-02 muc 2.15: don sau 24h00 ngay LV cuoi thang la KHONG hop le -> ky vong bi chan.
  // BUG da biet (2026-10-07): he thong van cho tao. Test nay ghi lai HANH VI HIEN TAI va assert
  // request that su toi server (khong dung test.fail vi test.fail nuot ca loi selector).
  // Khi dev sua xong, test se fail -> doi assertion thanh: errorCode khac null, createdId null.
  test('[RON-LEAVE-013] BUG da biet: don thang truoc (qua han chot cuoi thang) van tao duoc', async ({ api, createdRequests }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Khong chan don qua han chot cuoi thang (QD-04-02 muc 2.15)' });

    // Arrange
    const periods: LeavePeriod[] = [{ day: lastWorkingDayOfPreviousMonth(todayInVietnam()), from: '08:00', to: '12:00' }];
    await skipIfOccupied(api, periods);
    await form.open();
    await form.fill({ periods, planned: false, approver: APPROVER, reason: `${AUTOMATION_REASON_PREFIX}LEAVE-013` });

    // Act
    const result = await form.submit();
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert: request toi duoc server va don duoc tao (hanh vi bug)
    expect(result.httpStatus, 'Request tao don phai duoc gui').toBe(200);
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    const created = await api.getById(result.createdId!, periods[0].day, periods[0].day);
    expect(created?.timeIntervals[0].day).toBe(periods[0].day);
  });
});
