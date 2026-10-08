import { AUTOMATION_REASON_PREFIX, expect, test } from '../../fixtures/employee-session-fixture';
import { CheckInRegisterFormPage } from '../../pages/check-in-register-form-page';
import { ACTIVE_CHECK_IN_STATUSES, type CheckInRegister, type RonApiClient } from '../../utils/ron-api-client';
import { lastWorkingDayOfPreviousMonth, monthRange, todayInVietnam, type IsoDate } from '../../utils/working-days';

// QD-04-02 muc 1.7 - Cham cong bo sung. TAO DON THAT tren account test (RON_USERNAME).
// - Han muc 5 don/thang: he thong dem moi don tru don Huy -> fixture checkInCleanup tu huy
//   don AUTOTEST_ sau moi test de khong tieu han muc.
// - Ngay dung dong theo ngay chay: chi ngay DA QUA trong thang (datepicker khoa hom nay/tuong lai)
//   va chua co don nao (tru Huy). Thieu ngay/han muc -> skip, khong dung den du lieu that.

const APPROVER = process.env.RON_APPROVER || '';
const MONTHLY_LIMIT = 5;
const TIME = { checkIn: '08:00', checkOut: '12:00' } as const;

const isCounted = (r: CheckInRegister) => r.approvalStatus !== 'CANCELED';

/** Don cham cong trong thang chua `day`, kem so don tinh vao han muc. */
async function monthState(api: RonApiClient, day: IsoDate) {
  const [from, to] = monthRange(day);
  const requests = await api.listMyCheckInRegisters(from, to);
  return { requests, counted: requests.filter(isCounted).length };
}

/** Ngay trong thang hien tai co don Remote con hieu luc (Cho xu ly / Chap thuan). */
async function remoteRequestDays(api: RonApiClient): Promise<Set<IsoDate>> {
  const [from, to] = monthRange(todayInVietnam());
  const remotes = (await api.listMyRequests(from, to)).filter((r) => r.type === 'REMOTE' && ['PENDING', 'APPROVED'].includes(r.approvalStatus));
  return new Set(remotes.flatMap((r) => r.timeIntervals.map((t) => t.day)));
}

/** Ngay da qua trong thang hien tai chua co don nao (tru Huy), moi nhat truoc. */
function freePastDays(requests: CheckInRegister[]): IsoDate[] {
  const today = todayInVietnam();
  const used = new Set(requests.filter(isCounted).map((r) => r.day));
  const days: IsoDate[] = [];
  for (let d = Number(today.slice(8, 10)) - 1; d >= 1; d--) {
    const day = `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
    if (!used.has(day)) days.push(day);
  }
  return days;
}

test.describe('Don cham cong - quy dinh QD-04-02 muc 1.7', () => {
  test.skip(!APPROVER, 'Chua set RON_APPROVER (nguoi kiem duyet) trong .env');

  let form: CheckInRegisterFormPage;

  test.beforeEach(async ({ employeePage, checkInCleanup }) => {
    void checkInCleanup; // dang ky don dep cho moi test
    form = new CheckInRegisterFormPage(employeePage);
  });

  test.afterEach(async () => {
    await form.close();
  });

  async function submitFor(day: IsoDate, caseId: string, remote = false) {
    await form.open();
    await form.fill({ approver: APPROVER, day, ...TIME, remote, reason: `${AUTOMATION_REASON_PREFIX}${caseId}` });
    return form.submit();
  }

  /** API tao tra id = null -> tim don vua tao theo ngay + li do. */
  async function findCreated(api: RonApiClient, day: IsoDate, caseId: string) {
    return (await api.listMyCheckInRegisters(day, day)).find((r) => r.reason === `${AUTOMATION_REASON_PREFIX}${caseId}`);
  }

  test('[RON-CHECKIN-001] Don hop le du thoi gian, anh, li do thi tao duoc va o trang thai Cho xu ly', async ({ api }) => {
    // Arrange
    const { requests, counted } = await monthState(api, todayInVietnam());
    const [day] = freePastDays(requests);
    test.skip(!day || counted >= MONTHLY_LIMIT, `Khong con ngay trong / han muc thang (da dung ${counted})`);

    // Act
    const result = await submitFor(day, 'CHECKIN-001');

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(result.toasts).toContain('Tạo thành công!');
    const created = await findCreated(api, day, 'CHECKIN-001');
    expect(created).toMatchObject({ day, checkIn: '08:00:00', checkOut: '12:00:00', approvalStatus: 'PENDING', isRemote: false });
    expect(created?.imageUrl, 'Anh bang chung phai duoc luu').toHaveLength(1);
  });

  // QD-04-02 muc 3.5: remote quen cham cong cung dung don nay, tick "Lam viec tu xa".
  // Server chi nhan don remote cho ngay DA CO don Remote (Cho xu ly/Chap thuan) - do 08/10.
  test('[RON-CHECKIN-006] Tick Lam viec tu xa cho ngay khong co don Remote thi bi chan', async ({ api }) => {
    // Arrange
    const { requests, counted } = await monthState(api, todayInVietnam());
    const remoteDays = await remoteRequestDays(api);
    const day = freePastDays(requests).find((d) => !remoteDays.has(d));
    test.skip(!day || counted >= MONTHLY_LIMIT, `Khong con ngay trong / han muc thang (da dung ${counted})`);

    // Act
    const result = await submitFor(day!, 'CHECKIN-006', true);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('NOT_REGISTER_REMOTE_FOR_SUPPLEMENT');
    expect(result.toasts).toContain('Ngày này chưa có đơn đăng ký remote.');
  });

  // Chi DOC don Remote co san lam dieu kien; don cham cong AUTOTEST_ tao ra duoc fixture tu huy.
  test('[RON-CHECKIN-007] Tick Lam viec tu xa cho ngay co don Remote thi tao duoc voi isRemote = true', async ({ api }) => {
    // Arrange
    const { requests, counted } = await monthState(api, todayInVietnam());
    const activeDays = new Set(requests.filter((r) => ACTIVE_CHECK_IN_STATUSES.has(r.approvalStatus)).map((r) => r.day));
    const day = [...(await remoteRequestDays(api))].find((d) => d < todayInVietnam() && !activeDays.has(d));
    test.skip(!day || counted >= MONTHLY_LIMIT, 'Thang nay khong co ngay da qua co don Remote (hoac het han muc)');

    // Act
    const result = await submitFor(day!, 'CHECKIN-007', true);

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(await findCreated(api, day!, 'CHECKIN-007')).toMatchObject({ day, approvalStatus: 'PENDING', isRemote: true });
  });

  test('[RON-CHECKIN-002] Ngay da co don con hieu luc thi bi chan EXISTED (1 lan/ngay)', async ({ api }) => {
    // Arrange: dung ngay da co don hieu luc; neu khong co thi tao 1 don truoc
    const { requests, counted } = await monthState(api, todayInVietnam());
    // Het han muc thi server co the tra MAX_... truoc EXISTED -> khong ket luan duoc
    test.skip(counted >= MONTHLY_LIMIT, `Het han muc thang (da dung ${counted})`);
    let day = requests.find((r) => ACTIVE_CHECK_IN_STATUSES.has(r.approvalStatus))?.day;
    if (!day) {
      day = freePastDays(requests)[0];
      test.skip(!day, 'Khong co ngay de dung don hieu luc');
      expect((await submitFor(day, 'CHECKIN-002-SEED')).errorCode).toBeNull();
    }

    // Act
    const result = await submitFor(day, 'CHECKIN-002');

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('EXISTED');
    expect(result.toasts).toContain('Đã tồn tại!');
  });

  test('[RON-CHECKIN-003] Toi da 5 don/thang, don tiep theo bi chan', async ({ api }) => {
    test.setTimeout(240_000); // tao toi 5 don qua UI; do sang 08/10 da mat 1.7 phut
    // Arrange: lap day han muc bang don AUTOTEST_ (fixture tu huy het sau test)
    const { requests, counted } = await monthState(api, todayInVietnam());
    const days = freePastDays(requests);
    const toFill = MONTHLY_LIMIT - counted;
    test.skip(toFill < 0 || days.length < toFill + 1, `Can ${toFill + 1} ngay trong, chi co ${days.length}`);
    for (const [i, day] of days.slice(0, toFill).entries()) {
      expect((await submitFor(day, `CHECKIN-003-FILL${i + 1}`)).errorCode, `Don lap han muc ${day}`).toBeNull();
    }

    // Act
    const result = await submitFor(days[toFill], 'CHECKIN-003');

    // Assert
    expect(result.errorCode, JSON.stringify(result)).toBe('MAX_CHECKIN_REGISTER_ALLOW_IN_MONTH');
    expect(result.toasts.join('\n')).toContain('vượt quá số lần đăng ký bổ sung chấm công trong tháng');
  });

  // BUG da biet (2026-10-07): QD 1.7 "don bi tu choi khong duoc dang ky lai" nhung he thong cho tao.
  // Test ghi lai HANH VI HIEN TAI; khi dev sua -> doi assertion thanh errorCode khac null.
  test('[RON-CHECKIN-004] BUG da biet: ngay co don bi Tu choi van dang ky lai duoc', async ({ api }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Khong chan dang ky lai ngay bi Tu choi (QD-04-02 muc 1.7)' });

    // Arrange
    const { requests, counted } = await monthState(api, todayInVietnam());
    const activeDays = new Set(requests.filter((r) => ACTIVE_CHECK_IN_STATUSES.has(r.approvalStatus)).map((r) => r.day));
    const day = requests.find((r) => r.approvalStatus === 'REJECTED' && !activeDays.has(r.day))?.day;
    test.skip(!day || counted >= MONTHLY_LIMIT, 'Thang nay khong co ngay bi Tu choi (hoac het han muc)');

    // Act
    const result = await submitFor(day!, 'CHECKIN-004');

    // Assert (hanh vi bug): don moi that su ton tai, ngay do co ca don Tu choi lan don Cho xu ly
    expect(result.httpStatus, 'Request tao don phai duoc gui').toBe(200);
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(await findCreated(api, day!, 'CHECKIN-004')).toMatchObject({ day, approvalStatus: 'PENDING' });
  });

  // BUG da biet (2026-10-07): QD 1.7 han chot 24h00 ngay LV cuoi thang, he thong van cho tao don thang truoc.
  test('[RON-CHECKIN-005] BUG da biet: don cho ngay thang truoc (qua han chot) van tao duoc', async ({ api }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Khong chan don qua han chot cuoi thang (QD-04-02 muc 1.7)' });

    // Arrange. Ngay 1: datepicker co the mo o thang truoc (chua kiem chung) -> dieu huong thang sai
    test.skip(todayInVietnam().endsWith('-01'), 'Ngay 1 cua thang: chua kiem chung datepicker mo o thang nao');
    const day = lastWorkingDayOfPreviousMonth(todayInVietnam());
    const { requests, counted } = await monthState(api, day);
    test.skip(requests.some((r) => r.day === day && isCounted(r)) || counted >= MONTHLY_LIMIT, `Ngay ${day} da co don / het han muc`);

    // Act
    const result = await submitFor(day, 'CHECKIN-005');

    // Assert (hanh vi bug): don cho ngay thang truoc that su ton tai
    expect(result.httpStatus, 'Request tao don phai duoc gui').toBe(200);
    expect(result.errorCode, JSON.stringify(result)).toBeNull();
    expect(await findCreated(api, day, 'CHECKIN-005')).toMatchObject({ day, approvalStatus: 'PENDING' });
  });
});
