import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { skipIfOccupied } from '../../fixtures/request-test-helpers';
import { OvertimeRequestFormPage, type OvertimeInterval } from '../../pages/overtime-request-form-page';
import type { RonApiClient } from '../../utils/ron-api-client';
import { addWorkingDays, isWorkingDay, shiftDays, todayInVietnam, type IsoDate } from '../../utils/working-days';

// QD-04-02 muc 5 - Lam them gio. TAO DON THAT tren account test; don tao thanh cong duoc
// fixture createdRequests tu huy. Automation khong bao gio duyet don.
//
// QD 5.8: OT dang ky theo gio thuc te, trong vong 3 ngay SAU khi lam. Do 2026-10-08: he thong lam
// NGUOC lai - chan ca ngay hom qua (RON-OT-006) nhung cho ngay tuong lai (RON-OT-005).
// => Case kiem phan loai ngay / luu khoang gio (001, 002, 004) buoc dung ngay TUONG LAI.
//    Khi dev sua 5.8: doi cac case nay sang ngay trong 3 ngay vua qua, dao assertion 005/006.

const APPROVER = process.env.RON_APPROVER || '';
const EVENING: OvertimeInterval[] = [{ from: '18:00', to: '20:00' }];

/** Ngay gan nhat SAU hom nay co thu = `weekday` (0 = CN, 6 = T7). */
function nextWeekday(weekday: number): IsoDate {
  let day = shiftDays(todayInVietnam(), 1);
  while (new Date(`${day}T00:00:00Z`).getUTCDay() !== weekday) day = shiftDays(day, 1);
  return day;
}

/** Ngay LV gan nhat trong 3 ngay vua qua (trong han QD 5.8), undefined neu khong co. */
function recentWorkingDayWithinDeadline(): IsoDate | undefined {
  for (let back = 1; back <= 3; back++) {
    const day = shiftDays(todayInVietnam(), -back);
    if (isWorkingDay(day)) return day;
  }
  return undefined;
}

test.describe('Don OT - quy dinh QD-04-02 muc 5', () => {
  test.skip(!APPROVER, 'Chua set RON_APPROVER (nguoi kiem duyet) trong .env');

  let form: OvertimeRequestFormPage;

  test.beforeEach(async ({ employeePage }) => {
    form = new OvertimeRequestFormPage(employeePage);
  });

  test.afterEach(async () => {
    await form.close();
  });

  async function submit(day: IsoDate, intervals: OvertimeInterval[], caseId: string) {
    await form.open();
    await form.fill({ day, intervals, approver: APPROVER, reason: `${AUTOMATION_REASON_PREFIX}${caseId}` });
    return form.submit();
  }

  /** Skip neu ngay OT da co don hieu luc (moi loai) cua account test. */
  async function skipIfDayOccupied(api: RonApiClient, day: IsoDate) {
    await skipIfOccupied(api, [{ day, allDay: true }]);
  }

  test('[RON-OT-001] OT ngay thuong hop le thi tao duoc, server phan loai otDayType NORMAL @smoke', async ({ api, createdRequests }) => {
    // Arrange
    const day = addWorkingDays(todayInVietnam(), 1);
    await skipIfDayOccupied(api, day);

    // Act
    const result = await submit(day, EVENING, 'OT-001');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain('Tạo thành công!');
    expect(result.createdId).not.toBeNull();
    expect(await api.getDetail(result.createdId!)).toMatchObject({
      type: 'OT',
      approvalStatus: 'PENDING',
      havePlanned: true,
      otDay: day,
      otDayType: 'NORMAL',
      timeIntervals: [{ day, from: '18:00:00', to: '20:00:00' }],
      reason: `${AUTOMATION_REASON_PREFIX}OT-001`,
    });
  });

  test('[RON-OT-002] OT nhieu khoang thoi gian trong 1 ngay thi luu du cac khoang (QD 5.10)', async ({ api, createdRequests }) => {
    // Arrange: 2 khoang tach quang nghi giua ca toi
    const day = addWorkingDays(todayInVietnam(), 1);
    await skipIfDayOccupied(api, day);
    const intervals: OvertimeInterval[] = [
      { from: '18:00', to: '19:00' },
      { from: '19:30', to: '21:00' },
    ];

    // Act
    const result = await submit(day, intervals, 'OT-002');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.createdId).not.toBeNull();
    expect((await api.getDetail(result.createdId!)).timeIntervals).toEqual([
      { day, from: '18:00:00', to: '19:00:00' },
      { day, from: '19:30:00', to: '21:00:00' },
    ]);
  });

  test('[RON-OT-003] OT dang ky qua 3 ngay sau khi lam thi bi chan TOO_LATE_TO_REGISTER_OVERTIME (QD 5.8)', async ({ api, createdRequests }) => {
    // Arrange: >= 7 ngay truoc -> qua han du tinh theo ngay lich hay ngay LV. Lui tiep neu ngay da co don
    // (tranh loi trung REGISTERED_OVERLAP_ERROR lan voi TOO_LATE). Datepicker OT khong co nut lui thang
    // (do 2026-10-08) -> chi chon duoc ngay trong thang hien tai.
    const today = todayInVietnam();
    const occupied = await api.occupiedDays(shiftDays(today, -13), shiftDays(today, -7));
    const day = [7, 8, 9, 10, 11, 12, 13]
      .map((back) => shiftDays(today, -back))
      .find((d) => d.slice(0, 7) === today.slice(0, 7) && !occupied.has(d));
    test.skip(!day, 'Khong co ngay trong thang hien tai, 7-13 ngay truoc, ma account test chua co don');

    // Act
    const result = await submit(day!, EVENING, 'OT-003');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('TOO_LATE_TO_REGISTER_OVERTIME');
    expect(result.toasts).toContain('Đơn đăng ký không thể nộp quá muộn!');
  });

  test('[RON-OT-004] OT thu 7 thi server phan loai otDayType WEEKEND', async ({ api, createdRequests }) => {
    // Arrange
    const day = nextWeekday(6);
    await skipIfDayOccupied(api, day);

    // Act
    const result = await submit(day, [{ from: '09:00', to: '11:00' }], 'OT-004');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.createdId).not.toBeNull();
    expect(await api.getDetail(result.createdId!)).toMatchObject({ type: 'OT', otDay: day, otDayType: 'WEEKEND' });
  });

  // BUG da biet (doc 07, 2026-10-07): QD 5.8 OT dang ky SAU khi lam, he thong van cho dang ky ngay tuong lai.
  // Test ghi lai HANH VI HIEN TAI; khi dev sua -> doi assertion thanh errorCode khac null.
  test('[RON-OT-005] BUG da biet: don OT cho ngay tuong lai van tao duoc', async ({ api, createdRequests }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Khong chan OT ngay tuong lai (QD-04-02 muc 5.8)' });

    // Arrange
    const day = addWorkingDays(todayInVietnam(), 2);
    await skipIfDayOccupied(api, day);

    // Act
    const result = await submit(day, EVENING, 'OT-005');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert (hanh vi bug)
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.createdId).not.toBeNull();
    expect(await api.getById(result.createdId!, day, day)).toMatchObject({ type: 'OT', approvalStatus: 'PENDING' });
  });

  // BUG phat hien 2026-10-08: OT ngay LV hom qua (07/10, nop 08/10) bi chan TOO_LATE_TO_REGISTER_OVERTIME,
  // trai QD 5.8 (duoc dang ky trong 3 ngay sau khi lam). Ghi HANH VI HIEN TAI; dev sua -> doi thanh toBeNull().
  test('[RON-OT-006] BUG: OT ngay LV vua lam, con trong han 3 ngay, van bi chan TOO_LATE_TO_REGISTER_OVERTIME', async ({ api, createdRequests }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Chan OT dang ky trong han 3 ngay sau khi lam (QD-04-02 muc 5.8)' });

    // Arrange
    const day = recentWorkingDayWithinDeadline();
    test.skip(!day, 'Khong co ngay LV trong 3 ngay vua qua');
    await skipIfDayOccupied(api, day!);

    // Act
    const result = await submit(day!, EVENING, 'OT-006');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert (hanh vi bug)
    expect(result.errorCode, JSON.stringify(result)).toBe('TOO_LATE_TO_REGISTER_OVERTIME');
  });

  // QD-04-02 muc 5.6: OT Chu nhat tinh la OT ngay nghi. Doc 07: chua ro server tach CN rieng hay gop chung T7.
  // Do 2026-10-13: gop chung WEEKEND. Dung ngay tuong lai vi QD 5.8 dang bi lam nguoc (xem dau file).
  test('[RON-OT-007] OT Chu nhat thi server phan loai otDayType WEEKEND (QD 5.6)', async ({ api, createdRequests }) => {
    // Arrange
    const day = nextWeekday(0);
    await skipIfDayOccupied(api, day);

    // Act
    const result = await submit(day, [{ from: '09:00', to: '11:00' }], 'OT-007');
    if (result.createdId) createdRequests.add(result.createdId);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.createdId).not.toBeNull();
    expect(await api.getDetail(result.createdId!)).toMatchObject({ type: 'OT', otDay: day, otDayType: 'WEEKEND' });
  });
});
