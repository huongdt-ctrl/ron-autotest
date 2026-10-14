import { expect, test, TEST_DATA_PREFIX } from '../../fixtures/employee-session-fixture';
import { STATUS_LABELS, toDisplayDate, TYPE_LABELS, WorkTimeRequestListPage } from '../../pages/work-time-request-list-page';
import {
  CancelRequestModal,
  EMPTY_NOTE,
  minutesToHoursText as h,
  RequestDetailModal,
  RequestStatisticsModal,
} from '../../pages/work-time-request-modals';
import type { ApprovalStatus, RonApiClient, WorkTimeRegister } from '../../utils/ron-api-client';
import { shiftDays, shiftMonthStart, todayInVietnam } from '../../utils/working-days';

// Man "Don dang ky" (doc 04) - modal Chi tiet don, Thong ke va khoa nut 🗑. CHI DOC (writeGuard chan ghi).
// Chi thao tac tren don AUTOTEST_ cua account test; khong co don phu hop -> skip.

/** Don AUTOTEST_ moi nhat co trang thai `status` trong 12 thang qua .. 3 thang toi. */
async function findAutotestRequest(api: RonApiClient, status: ApprovalStatus): Promise<WorkTimeRegister | undefined> {
  const today = todayInVietnam();
  const { results } = await api.searchMyRequests({ page: 1, size: 500, from: shiftMonthStart(today, -12), to: shiftMonthStart(today, 3), status });
  return results.find((r) => r.reason?.startsWith(TEST_DATA_PREFIX));
}

/** '2026-10-07T11:41:43.67' -> '11:41, 07-10-2026' (gio server, khong doi mui gio). */
function formatCreatedAt(createdAt: string): string {
  return `${createdAt.slice(11, 16)}, ${toDisplayDate(createdAt.slice(0, 10))}`;
}

test.describe('Don dang ky - chi tiet, thong ke, khoa huy don', () => {
  let screen: WorkTimeRequestListPage;

  test.beforeEach(async ({ employeePage }) => {
    screen = new WorkTimeRequestListPage(employeePage);
  });

  /**
   * Mo danh sach chi gom ngay dau cua don + trang thai cua no, tra ve cac dong co cung li do.
   * Li do AUTOTEST_ co the trung giua cac lan chay (vd don Huy) -> caller tu chon dong.
   */
  async function openRowsOf(request: WorkTimeRegister) {
    const day = request.timeIntervals[0].day;
    await screen.goto({ page: 1, size: 20, type: 'null', status: request.approvalStatus, from: day, to: day });
    const rows = screen.rowByReason(request.reason!);
    await expect(rows.first()).toBeVisible();
    return rows;
  }

  test('[RON-REQLIST-008] Chi tiet don da Chap thuan hien dung du lieu API, co Nguoi da duyet', async ({ api, employeePage }) => {
    // Arrange
    const request = await findAutotestRequest(api, 'APPROVED');
    test.skip(!request, 'Account test khong co don AUTOTEST_ Chap thuan');
    const detail = await api.getDetail(request!.id);
    const rows = await openRowsOf(request!);
    await expect(rows, 'Li do don Chap thuan phai duy nhat de chac dung dong').toHaveCount(1);
    const modal = new RequestDetailModal(employeePage);

    // Act
    await modal.open(screen.detailButton(rows));
    const fields = await modal.details();
    const times = await modal.timeItems();
    await modal.close();

    // Assert
    expect(fields).toMatchObject({
      'Thời gian tạo': formatCreatedAt(detail.createdAt!),
      'Người kiểm duyệt': detail.assignedUser!.username,
      'Người đã duyệt': detail.actualApprovalUser!.username,
      'Loại đơn': TYPE_LABELS[detail.type],
      'Trạng thái': STATUS_LABELS.APPROVED,
      'Lí do': detail.reason ?? '',
      'Ghi chú': detail.note || EMPTY_NOTE,
    });
    for (const t of detail.timeIntervals) {
      const range = `Từ ${t.from.slice(0, 5)} đến ${t.to.slice(0, 5)}`;
      expect(times.some((item) => item.includes(range)), `Thieu khoang ${range} trong ${JSON.stringify(times)}`).toBe(true);
    }
  });

  // QD-04-02 muc 2.16: don da duyet khong tu huy tren he thong (phai email chamcong@nal.vn).
  // Doc 04 diem bat thuong 6: don Huy / Chap thuan van hien 🗑 nhung bi khoa, khong co tooltip giai thich.
  for (const [caseNo, status] of [['009', 'CANCELED'], ['010', 'APPROVED']] as const) {
    test(`[RON-REQLIST-${caseNo}] Don ${STATUS_LABELS[status]}: nut 🗑 bi khoa, bam vao khong mo modal Huy don`, async ({ api, employeePage }) => {
      // Arrange
      const request = await findAutotestRequest(api, status);
      test.skip(!request, `Account test khong co don AUTOTEST_ ${status}`);
      const row = (await openRowsOf(request!)).first(); // moi dong cung trang thai deu dung duoc
      const cancelButton = screen.cancelButton(row);
      const cancelModal = new CancelRequestModal(employeePage);
      await expect(row.locator('td').nth(4)).toHaveText(STATUS_LABELS[status]);

      // Act: force de bam duoc ca khi nut bi pointer-events: none
      await cancelButton.click({ force: true });
      // Modal mo bang state React ngay sau click; cho 1 nhip de chac chan khong mo tre.
      await employeePage.waitForTimeout(1_000);

      // Assert
      await expect(cancelButton).toHaveCSS('cursor', 'not-allowed');
      await expect(cancelModal.modal).toBeHidden();
    });
  }

  test('[RON-REQLIST-011] Modal Thong ke hien dung so gio tu API summary (phut -> gio)', async ({ api, employeePage }) => {
    // Arrange
    await screen.goto();
    const s = await api.workTimeSummary();
    const modal = new RequestStatisticsModal(employeePage);

    // Act
    await modal.open(employeePage.getByRole('button', { name: 'Thống kê' }));
    const fields = await modal.details();
    await modal.close();

    // Assert: chi so khong mo ho ve field API. Nghi phep nam / ton nam cu / sinh nhat / huong luong
    // chua xac dinh chac field tuong ung -> chi kiem co hien.
    expect(fields).toMatchObject({
      'Tổng thời gian đã remote trong tháng': `${h(s.remoteInMonth)}/${h(s.totalTimeAllowRemoteInMonth)} giờ`,
      'Tổng thời gian đã remote trong năm': `${h(s.totalRemoteTimeInYear)} giờ`,
      'Nghỉ không hưởng lương': `${h(s.unpaidDayOffTime)} giờ`,
      'Nghỉ theo chế độ bảo hiểm': `${h(s.insuranceLeaveDayOffTime)} giờ`,
      'Số giờ OT ngày thường': `Sáng: ${h(s.normalDayOtTime)} giờ, Tối: ${h(s.normalNightOtTime)} giờ`,
      'Số giờ OT ngày nghỉ': `Sáng: ${h(s.normalDayOffDayOtTime)} giờ, Tối: ${h(s.normalDayOffNightOtTime)} giờ`,
      'Số giờ OT ngày lễ': `Sáng: ${h(s.holidayOtTime)} giờ, Tối: ${h(s.holidayNightOtTime)} giờ`,
    });
    for (const label of ['Tổng thời gian đã nghỉ phép trong năm', 'Nghỉ phép tồn năm cũ', 'Nghỉ phép sinh nhật', 'Nghỉ hưởng lương', 'Nghỉ việc riêng hưởng lương']) {
      expect(fields[label], label).toMatch(/^\d+(\.\d+)?(\/\d+(\.\d+)?)? giờ$/);
    }
  });

  // Doc 04 role/permission: rui ro IDOR khi doc chi tiet don cua nguoi khac. CHI DOC (GET), khong goi selfCancel.
  // ID don nguoi khac lay tu lich Trang chu (don cua dong nghiep cung nguoi duyet). Do 2026-10-13: server chan.
  test('[RON-REQLIST-015] Xem chi tiet don cua nguoi khac qua API thi bi chan FORBIDDEN', async ({ api }) => {
    // Arrange
    const me = (await api.userInfo()).username;
    const today = todayInVietnam();
    let otherId: number | undefined;
    for (const approver of await api.approvalUsers()) {
      const requests = await api.teamCalendarRequests(shiftMonthStart(today, -1), shiftDays(today, 60), approver.id);
      otherId ??= requests.find((r) => r.user.username !== me)?.id;
    }
    test.skip(!otherId, 'Khong tim thay don cua nguoi khac tren lich Trang chu');

    // Act
    const errorCode = await api.errorCodeOfGet(`/api/workTimeRegisters/${otherId}`);

    // Assert
    expect(errorCode).toBe('FORBIDDEN');
  });
});
