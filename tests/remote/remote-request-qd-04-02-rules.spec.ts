import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { allDays, skipIfOccupied } from '../../fixtures/request-test-helpers';
import type { TimePeriod } from '../../pages/ron-modal-form-controls';
import { RemoteRequestFormPage } from '../../pages/remote-request-form-page';
import type { RonApiClient } from '../../utils/ron-api-client';
import { addWorkingDays, isWorkingDay, lastWorkingDayOfPreviousMonth, todayInVietnam, type IsoDate } from '../../utils/working-days';

// QD-04-02 muc 3 - Lam viec tu xa. TAO DON THAT tren account test; don tao thanh cong duoc
// fixture createdRequests tu huy. Han muc remote/thang tinh ca don Cho xu ly (doc 06) -> case can
// han muc doc /api/workTime/summary va skip neu khong du, khong dung den don that.

const APPROVER = process.env.RON_APPROVER || '';
const PHONE = '0900000000';
const MINUTES_PER_DAY = 480;
const MAX_PERIODS = 10;
const isThisMonth = (day: IsoDate) => day.slice(0, 7) === todayInVietnam().slice(0, 7);
const periodMinutes = (p: TimePeriod) =>
  'allDay' in p ? MINUTES_PER_DAY : (Number(p.to.slice(0, 2)) - Number(p.from.slice(0, 2))) * 60 + Number(p.to.slice(3)) - Number(p.from.slice(3));

/** QD 3.9: so ngay LV bao truoc theo do dai remote (ngay). */
const requiredNotice = (days: number) => (days < 2 ? 1 : days < 5 ? 2 : 5);

test.describe('Don remote - quy dinh QD-04-02 muc 3', () => {
  test.skip(!APPROVER, 'Chua set RON_APPROVER (nguoi kiem duyet) trong .env');

  let form: RemoteRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new RemoteRequestFormPage(employeePage);
  });

  test.afterEach(async () => {
    await form.close();
  });

  /**
   * Skip neu han muc remote THANG NAY khong du cho phan khoang nam trong thang nay.
   * (API summary chi tra thang hien tai; phan sang thang sau khong kiem duoc.)
   */
  async function skipIfQuotaShort(api: RonApiClient, periods: TimePeriod[]) {
    const needed = periods.filter((p) => isThisMonth(p.day)).reduce((sum, p) => sum + periodMinutes(p), 0);
    if (!needed) return;
    const { used, allowed } = await api.remoteMinutesThisMonth();
    test.skip(allowed - used < needed, `Han muc remote con ${(allowed - used) / 60} gio, can ${needed / 60} gio`);
  }

  async function submit(periods: TimePeriod[], caseId: string, planned = true) {
    await form.open();
    const text = `${AUTOMATION_REASON_PREFIX}${caseId}`;
    await form.fill({ periods, planned, approver: APPROVER, channel: text, phone: PHONE, reason: text });
    return form.submit();
  }

  test('[RON-REMOTE-001] Remote nua ngay, bao truoc dung 1 ngay LV thi tao duoc', async ({ api, createdRequests }) => {
    // Arrange
    const day = addWorkingDays(todayInVietnam(), 1);
    const periods: TimePeriod[] = [{ day, from: '08:00', to: '12:00' }];
    await skipIfOccupied(api, periods);
    await skipIfQuotaShort(api, periods);

    // Act
    const result = await submit(periods, 'REMOTE-001');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain('Tạo thành công!');
    // Kenh giao tiep -> solution, SDT -> emergencyRemoteContact (doc 06); chi API chi tiet tra 2 field nay
    expect(result.createdId).not.toBeNull();
    expect(await api.getDetail(result.createdId!)).toMatchObject({
      timeIntervals: [{ day, from: '08:00:00', to: '12:00:00' }],
      type: 'REMOTE',
      approvalStatus: 'PENDING',
      solution: `${AUTOMATION_REASON_PREFIX}REMOTE-001`,
      emergencyRemoteContact: PHONE,
    });
  });

  test('[RON-REMOTE-002] Remote nua ngay nop cung ngay thi bi chan TOO_LATE_TO_REGISTER', async ({ api, createdRequests }) => {
    // Arrange
    const today = todayInVietnam();
    test.skip(!isWorkingDay(today), 'Hom nay khong phai ngay LV');
    const periods: TimePeriod[] = [{ day: today, from: '13:00', to: '17:00' }];
    await skipIfOccupied(api, periods);

    // Act
    const result = await submit(periods, 'REMOTE-002');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('TOO_LATE_TO_REGISTER');
    expect(result.toasts).toContain('Đơn đăng ký không thể nộp quá muộn!');
  });

  test('[RON-REMOTE-003] Remote 2 ngay, bao truoc thieu (1 ngay LV) thi bi chan TOO_LATE_TO_REGISTER', async ({ api, createdRequests }) => {
    // Arrange
    const periods = allDays(addWorkingDays(todayInVietnam(), requiredNotice(2) - 1), 2);
    await skipIfOccupied(api, periods);

    // Act
    // Gia dinh (do 07-08/10): server kiem bao truoc TRUOC han muc -> van ra TOO_LATE du han muc thieu.
    const result = await submit(periods, 'REMOTE-003');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('TOO_LATE_TO_REGISTER');
  });

  test('[RON-REMOTE-004] Remote 2 ngay, bao truoc dung 2 ngay LV thi tao duoc', async ({ api, createdRequests }) => {
    // Arrange
    const periods = allDays(addWorkingDays(todayInVietnam(), requiredNotice(2)), 2);
    await skipIfOccupied(api, periods);
    await skipIfQuotaShort(api, periods);

    // Act
    const result = await submit(periods, 'REMOTE-004');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.createdId).not.toBeNull();
  });

  test('[RON-REMOTE-005] Vuot han muc remote thang thi bi chan MAX_REMOTE_ALLOW_IN_MONTH (QD 3.3)', async ({ api, createdRequests }) => {
    // Arrange: so ngay ca ngay vua du vuot phan han muc con lai, bao truoc dung QD 3.9
    const { used, allowed } = await api.remoteMinutesThisMonth();
    const days = Math.max(1, Math.floor((allowed - used) / MINUTES_PER_DAY) + 1);
    test.skip(days > MAX_PERIODS, `Han muc con ${(allowed - used) / 60} gio, can > ${MAX_PERIODS} khoang de vuot`);
    const periods = allDays(addWorkingDays(todayInVietnam(), requiredNotice(days)), days);
    test.skip(!periods.every((p) => isThisMonth(p.day)), 'Cac ngay can dung tran sang thang sau');
    await skipIfOccupied(api, periods);

    // Act
    const result = await submit(periods, 'REMOTE-005');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('MAX_REMOTE_ALLOW_IN_MONTH');
    expect(result.toasts).toContain('Bạn đã vượt quá số thời gian remote tối đa trong tháng');
  });

  test('[RON-REMOTE-006] Remote le gio (khong tron nua ngay/ca ngay) thi bi chan (QD 3.4)', async ({ api, createdRequests }) => {
    // Arrange
    const periods: TimePeriod[] = [{ day: addWorkingDays(todayInVietnam(), 1), from: '09:00', to: '10:00' }];
    await skipIfOccupied(api, periods);

    // Act
    const result = await submit(periods, 'REMOTE-006');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('WORKING_TIME_INTERVAL_INVALID');
    expect(result.toasts).toContain('Thời gian đăng ký không hợp lệ!');
  });

  // BUG da biet (2026-10-07): QD 3.10 han chot 24h00 ngay LV cuoi thang, he thong van cho tao don thang truoc.
  // Test ghi lai HANH VI HIEN TAI; khi dev sua -> doi assertion thanh errorCode khac null.
  test('[RON-REMOTE-007] BUG da biet: don remote cho ngay thang truoc (qua han chot) van tao duoc', async ({ api, createdRequests }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Khong chan don remote qua han chot cuoi thang (QD-04-02 muc 3.10)' });

    // Arrange
    const day = lastWorkingDayOfPreviousMonth(todayInVietnam());
    const periods: TimePeriod[] = [{ day, from: '08:00', to: '12:00' }];
    await skipIfOccupied(api, periods);

    // Act
    const result = await submit(periods, 'REMOTE-007', false);
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert (hanh vi bug)
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.createdId).not.toBeNull();
    expect(await api.getById(result.createdId!, day, day)).toMatchObject({ type: 'REMOTE', approvalStatus: 'PENDING' });
  });
});
