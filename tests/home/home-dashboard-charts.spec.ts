import { expect, test } from '../../fixtures/employee-session-fixture';
import { HomeDashboardPage, SUMMARY_API } from '../../pages/home-dashboard-page';
import { todayInVietnam } from '../../utils/working-days';

// Trang chu - 3 bieu do thong ke theo nam (doc 02) - CHI DOC.
// Filter "Nam" chi doi bieu do (API dashBoard/workingTimeSummary), khong dong toi lich thang.

const CHARTS = [
  {
    name: 'Thống kê thời gian nghỉ phép',
    legends: ['Nghỉ hưởng lương', 'Nghỉ không hưởng lương', 'Nghỉ theo chế độ bảo hiểm', 'Nghỉ việc riêng hưởng lương', 'Nghỉ định kỳ tháng (Nhân viên nữ)'],
  },
  { name: 'Thống kê thời gian remote', legends: ['Remote'] },
  {
    // QD-04-02 muc 5.7: OT tach ngay thuong / ngay nghi / le x ngay / toi (toi = 22h-06h)
    name: 'Thống kê thời gian OT',
    legends: ['OT vào ngày nghỉ', 'OT vào ngày nghỉ lễ', 'OT vào ngày thường', 'OT vào tối ngày nghỉ', 'OT vào tối ngày nghỉ lễ', 'OT vào tối ngày thường'],
  },
];

const currentYear = () => Number(todayInVietnam().slice(0, 4));

test.describe('Trang chu - bieu do thong ke theo nam', () => {
  let screen: HomeDashboardPage;

  test.beforeEach(async ({ employeePage }) => {
    screen = new HomeDashboardPage(employeePage);
  });

  test('[RON-HOME-010] Co 3 bieu do dung tieu de, legend, truc Thang/Gio, truc X thang 1-12 (QD-04-02 muc 5.7)', async () => {
    // Arrange
    await screen.goto();

    // Act
    const charts = await screen.charts();

    // Assert
    expect(charts).toEqual(CHARTS.map((c) => ({ ...c, axisLabels: ['Tháng', 'Giờ'] })));
    for (const index of CHARTS.keys()) {
      expect(await screen.xAxisTicks(index), CHARTS[index].name).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    }
  });

  test('[RON-HOME-011] Doi Nam thi URL va API bieu do theo nam moi, lich thang khong doi va khong tai lai', async ({ employeePage }) => {
    // Arrange
    const year = currentYear() - 1;
    await screen.goto();
    const calendarTitle = await screen.calendarTitle.innerText();
    const calendarCalls = screen.recordCalendarCalls();

    // Act
    const summaryRequest = await screen.selectYear(year);
    await employeePage.waitForLoadState('networkidle');
    calendarCalls.stop();

    // Assert
    expect(summaryRequest.searchParams.get('year')).toBe(String(year));
    await expect.poll(() => new URL(employeePage.url()).searchParams.get('year')).toBe(String(year));
    expect((await screen.selectedFilters()).year).toBe(String(year));
    await expect(screen.calendarTitle).toHaveText(calendarTitle);
    expect(calendarCalls.calls).toEqual([]);
  });

  test('[RON-HOME-012] Mo link /?year=<nam truoc> thi bieu do lay du lieu nam tren link', async () => {
    // Arrange
    const year = currentYear() - 2;
    const summaryUrl = screen.page.waitForRequest((r) => {
      const url = new URL(r.url());
      return url.pathname === SUMMARY_API && url.searchParams.get('year') === String(year);
    });

    // Act
    await screen.goto(`/?year=${year}`);

    // Assert
    await summaryUrl;
    expect((await screen.selectedFilters()).year).toBe(String(year));
  });
});
