import { expect, test } from '../../fixtures/employee-session-fixture';
import { EVENT_TYPES, expectedEvents, sortEvents, STATUS_FILTER, STATUS_ICON_COLORS } from '../../pages/home-dashboard-calendar-events';
import { CALENDAR_COLUMNS, HOME_TITLE, HomeDashboardPage } from '../../pages/home-dashboard-page';
import type { RonApiClient } from '../../utils/ron-api-client';
import { shiftDays, shiftMonthStart, todayInVietnam, type IsoDate } from '../../utils/working-days';

// Trang chu - lich "Thong ke don Nghi phep - Remote - OT" (doc 02) - CHI DOC (writeGuard chan moi request ghi).
// Oracle = API assignedForTeamMembers goi DUNG from/to/poID ma app vua goi (doc tu request bat duoc).
// Du lieu lich la don that cua team -> test so khop theo du lieu, skip khi thang khong co don.

const ymOf = (day: IsoDate) => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
const toDdMmYyyy = (day: IsoDate) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** Doc lai du lieu lich theo dung request app vua goi. */
async function calendarOracle(api: RonApiClient, request: URL) {
  const q = request.searchParams;
  return api.teamCalendarRequests(q.get('from')!, q.get('to')!, Number(q.get('poID')));
}

test.describe('Trang chu - lich thong ke don theo nguoi quan ly', () => {
  let screen: HomeDashboardPage;

  test.beforeEach(async ({ employeePage }) => {
    screen = new HomeDashboardPage(employeePage);
  });

  test('[RON-HOME-001] Mo Trang chu thi URL co nam hien tai, filter mac dinh, lich thang hien tai to vang hom nay @smoke', async ({ employeePage, api }) => {
    // Arrange
    const today = todayInVietnam();
    const { year, month } = ymOf(today);
    const [firstApprover] = await api.approvalUsers();

    // Act
    const request = await screen.goto();

    // Assert
    expect(new URL(employeePage.url()).searchParams.get('year')).toBe(String(year));
    await expect(employeePage.getByRole('heading', { name: HOME_TITLE })).toBeVisible();
    expect(await screen.selectedFilters()).toEqual({ status: 'Tất cả', manager: firstApprover.username, year: String(year) });
    expect(request.searchParams.get('poID')).toBe(String(firstApprover.id));
    await expect(screen.calendarTitle).toHaveText(`tháng ${month} năm ${year}`);
    expect(await screen.columnHeaders()).toEqual(CALENDAR_COLUMNS);
    expect(await screen.todayCell()).toEqual({ date: today, background: 'rgba(255, 220, 40, 0.15)' });
  });

  test('[RON-HOME-002] Option filter: 5 trang thai, Nguoi quan ly = nguoi duyet cua user, Nam 2014-2038', async ({ api }) => {
    // Arrange
    const approvers = await api.approvalUsers();
    await screen.goto();

    // Act
    const statuses = await screen.options('status');
    const managers = await screen.options('manager');
    const years = await screen.options('year');

    // Assert
    expect(statuses).toEqual(Object.keys(STATUS_FILTER));
    expect(managers).toEqual(approvers.map((u) => u.username));
    expect(years).toEqual(Array.from({ length: 25 }, (_, i) => String(2014 + i)));
  });

  test('[RON-HOME-003] Su kien lich khop API: nhan "<user>: <NP|RM|OT> - gio", dung class va mau nen theo loai, don Huy khong hien', async ({ api }) => {
    // Arrange
    const request = await screen.goto();
    const expected = expectedEvents(await calendarOracle(api, request), await screen.gridRange());
    test.skip(expected.length === 0, 'Thang hien tai khong co don nao cua nguoi quan ly mac dinh');

    // Act
    const events = await screen.calendarEvents();

    // Assert
    expect(sortEvents(events)).toEqual(sortEvents(expected));
    for (const e of events) {
      const type = Object.values(EVENT_TYPES).find((t) => e.label.includes(`: ${t.code} - `));
      expect(type, `Ma loai cua "${e.label}"`).toBeDefined();
      expect({ cssClass: e.cssClass, background: e.background }, e.label).toEqual({ cssClass: type!.cssClass, background: type!.background });
    }
  });

  test('[RON-HOME-004] Icon trang thai: cho duyet cam, da duyet xanh, tu choi do', async ({ api }) => {
    // Arrange
    const request = await screen.goto();
    const expected = expectedEvents(await calendarOracle(api, request), await screen.gridRange()).filter((x) => STATUS_ICON_COLORS[x.status]);
    test.skip(expected.length === 0, 'Thang hien tai khong co don Cho duyet / Da duyet / Tu choi');

    // Act
    const events = await screen.calendarEvents();

    // Assert: ghep su kien UI voi API theo ngay + nhan
    for (const e of expected) {
      const shown = events.find((u) => u.date === e.date && u.label === e.label);
      expect(shown?.iconColor, `${e.date} ${e.label} (${e.status})`).toBe(STATUS_ICON_COLORS[e.status]);
    }
  });

  test('[RON-HOME-005] Filter Trang thai don loc ngay o client, khong goi lai API', async ({ employeePage, api }) => {
    // Arrange
    const request = await screen.goto();
    const all = expectedEvents(await calendarOracle(api, request), await screen.gridRange());
    test.skip(all.length === 0, 'Thang hien tai khong co don nao cua nguoi quan ly mac dinh');
    const calendarCalls = screen.recordCalendarCalls();

    for (const [label, status] of Object.entries(STATUS_FILTER)) {
      // Act
      await screen.selectStatus(label);

      // Assert
      const expected = all.filter((e) => status === null || e.status === status);
      await expect.poll(async () => sortEvents(await screen.calendarEvents()), { message: `Trang thai "${label}"` }).toEqual(sortEvents(expected));
    }
    calendarCalls.stop();
    expect(calendarCalls.calls).toEqual([]);
  });

  test('[RON-HOME-006] Doi Nguoi quan ly thi goi lai API voi poID cua nguoi do va lich hien don theo nguoi duyet moi', async ({ api }) => {
    // Arrange
    const approvers = await api.approvalUsers();
    test.skip(approvers.length < 2, 'Account test chi co 1 nguoi duyet');
    const target = approvers[1];
    await screen.goto();

    // Act
    const request = await screen.selectManager(target.username);

    // Assert
    expect(request.searchParams.get('poID')).toBe(String(target.id));
    const expected = expectedEvents(await calendarOracle(api, request), await screen.gridRange());
    expect(sortEvents(await screen.calendarEvents())).toEqual(sortEvents(expected));
  });

  test('[RON-HOME-007] Bam su kien mo popover ngay dd/MM/yyyy liet ke su kien trong ngay; bam x thi dong', async () => {
    // Arrange
    await screen.goto();
    const events = await screen.calendarEvents();
    test.skip(events.length === 0, 'Lich thang hien tai khong co su kien');
    const day = events[0].date;

    // Act
    const popover = await screen.openEventPopover(0);

    // Assert
    expect(popover.title).toBe(toDdMmYyyy(day));
    expect(popover.labels.sort()).toEqual(events.filter((e) => e.date === day).map((e) => e.label).sort());
    await screen.closePopover();
    await expect(screen.popover).toBeHidden();
  });

  test('[RON-HOME-008] Bam Tiep sang thang sau: tieu de doi, su kien thang sau khop API lan tai dau', async ({ api }) => {
    // Arrange: lan tai dau app lay 2 thang (thang hien tai + thang sau)
    const next = ymOf(shiftMonthStart(todayInVietnam(), 1));
    const request = await screen.goto();
    const requests = await calendarOracle(api, request);

    // Act
    await screen.next();

    // Assert
    await expect(screen.calendarTitle).toHaveText(`tháng ${next.month} năm ${next.year}`);
    const expected = expectedEvents(requests, await screen.gridRange());
    test.skip(expected.length === 0, 'Thang sau khong co don nao cua nguoi quan ly mac dinh');
    await expect.poll(async () => sortEvents(await screen.calendarEvents())).toEqual(sortEvents(expected));
  });

  // BUG (do 12/10): lan tai dau chi lay from = dau thang hien tai .. cuoi thang sau; bam Truoc KHONG goi
  // lai API -> thang truoc trong tron du API co don. Test ghi lai HANH VI HIEN TAI. Dev sua xong -> doi
  // assertion: co request voi from/to phu thang truoc va lich hien du su kien API. Xem BUG-02 o
  // docs/ron-system/autotest-bugs-cho-log.md
  test('[RON-HOME-009] BUG da biet: bam Truoc sang thang truoc thi khong tai don, lich trong du API co don', async ({ employeePage, api }) => {
    test.info().annotations.push({ type: 'known-bug', description: 'Lich khong tai lai du lieu khi chuyen sang thang truoc' });

    // Arrange
    const today = todayInVietnam();
    const prevFrom = shiftMonthStart(today, -1);
    const prevTo = shiftDays(shiftMonthStart(today, 0), -1);
    const request = await screen.goto();
    const prevRequests = await api.teamCalendarRequests(prevFrom, prevTo, Number(request.searchParams.get('poID')));
    const expectedPrev = expectedEvents(prevRequests, [prevFrom, prevTo]);
    test.skip(expectedPrev.length === 0, `Nguoi quan ly mac dinh khong co don nao thang ${prevFrom.slice(0, 7)}`);
    const calendarCalls = screen.recordCalendarCalls();

    // Act
    await screen.previous();
    await employeePage.waitForLoadState('networkidle');
    calendarCalls.stop();

    // Assert (hanh vi bug)
    const prev = ymOf(prevFrom);
    await expect(screen.calendarTitle).toHaveText(`tháng ${prev.month} năm ${prev.year}`);
    expect(calendarCalls.calls).toEqual([]);
    const shownPrev = (await screen.calendarEvents()).filter((e) => e.date >= prevFrom && e.date <= prevTo);
    expect(shownPrev).toEqual([]);
  });
});
