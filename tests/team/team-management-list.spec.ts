import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppSidebarPage } from '../../pages/app-sidebar-page';
import {
  MEMBER_MODAL_TITLE,
  NO_DATA_TEXT,
  TEAM_MANAGEMENT_PATH,
  TeamManagementPage,
  toMemberRow,
  toTeamRow,
} from '../../pages/team-management-page';

// Man "Danh sach team" (doc 11) - CHI DOC voi nhan vien (writeGuard chan moi request ghi).
// Du lieu team do admin quan ly, thu tu do server quyet -> lay API cung query lam oracle cho UI.

const PAGE_SIZE = 20;
/** Tu khoa tim mot phan ten team (doc 11 muc 05_Test_Data: `Chi` -> 1 team). */
const PARTIAL_NAME = 'Chi';
const NOT_FOUND_NAME = 'AUTOTEST_khong_ton_tai';
/** Ky tu dac biet: wildcard SQL LIKE (% _), quote, the HTML. */
const SPECIAL_CHARS = `%_'"<b>`;

test.describe('Danh sach team - xem team va thanh vien', () => {
  let screen: TeamManagementPage;

  test.beforeEach(async ({ employeePage }) => {
    screen = new TeamManagementPage(employeePage);
  });

  test('[RON-TEAM-001] Mo tu sidebar Nhan su thi hien Danh sach team trang 1, 20 dong/trang @smoke', async ({ employeePage }) => {
    // Arrange
    const sidebar = new AppSidebarPage(employeePage);
    await employeePage.goto('/');
    await sidebar.expandAll();

    // Act
    await screen.waitForList(() => sidebar.nav.locator(`a[href="${TEAM_MANAGEMENT_PATH}"]`).click());

    // Assert
    await expect(employeePage.getByRole('heading', { name: 'Danh sách team' })).toBeVisible();
    expect(screen.urlQuery()).toMatchObject({ page: '1', size: String(PAGE_SIZE) });
    expect(await screen.columnHeaders()).toEqual(['Ảnh', 'Tên team', 'Email', 'Mô tả', 'Trạng thái', 'Tùy chỉnh']);
    await expect(screen.searchInput).toHaveValue('');
  });

  test('[RON-TEAM-002] Bang trang 1 hien dung du lieu API (ten, email, mo ta, trang thai) va thong tin phan trang', async ({ api }) => {
    // Arrange
    const { total, results } = await api.listTeams({ page: 1, size: PAGE_SIZE });

    // Act
    await screen.goto({ page: 1, size: PAGE_SIZE });

    // Assert
    expect(await screen.tableRows()).toEqual(results.map(toTeamRow));
    await expect(screen.pageInfo).toHaveText(`1-${results.length} trên ${total}`);
    // Moi dong chi co dung 1 nut (👁): nhan vien khong co nut sua/xoa team (doc 11 Role/permission)
    for (let i = 0; i < results.length; i++) await expect(screen.rows.nth(i).locator('button')).toHaveCount(1);
  });

  test('[RON-TEAM-003] Bam trang sau thi URL page=2 va bang hien dung trang 2 cua API', async ({ api }) => {
    // Arrange
    const { total, results } = await api.listTeams({ page: 2, size: PAGE_SIZE });
    test.skip(total <= PAGE_SIZE, `Can > ${PAGE_SIZE} team de phan trang (co ${total})`);
    await screen.goto({ page: 1, size: PAGE_SIZE });

    // Act
    await screen.waitForList(() => screen.nextPageButton().click());

    // Assert
    expect(screen.urlQuery()).toMatchObject({ page: '2', size: String(PAGE_SIZE) });
    expect(await screen.tableRows()).toEqual(results.map(toTeamRow));
    await expect(screen.pageInfo).toHaveText(`${PAGE_SIZE + 1}-${PAGE_SIZE + results.length} trên ${total}`);
  });

  test('[RON-TEAM-004] Go mot phan ten team thi tim ngay (khong can Enter), URL co teamName, bang loc server-side', async ({ api }) => {
    // Arrange
    const expected = await api.listTeams({ page: 1, size: PAGE_SIZE, teamName: PARTIAL_NAME });
    test.skip(expected.total === 0, `Khong con team nao chua "${PARTIAL_NAME}" tren moi truong test`);
    await screen.goto({ page: 1, size: PAGE_SIZE });

    // Act
    await screen.search(PARTIAL_NAME);

    // Assert
    expect(screen.urlQuery()).toMatchObject({ page: '1', teamName: PARTIAL_NAME });
    const rows = await screen.tableRows();
    expect(rows).toEqual(expected.results.map(toTeamRow));
    for (const row of rows) expect(row.name.toLowerCase(), 'Ten team chua tu khoa').toContain(PARTIAL_NAME.toLowerCase());
    await expect(screen.pageInfo).toHaveText(`1-${rows.length} trên ${expected.total}`);
  });

  test('[RON-TEAM-005] Tim ten team khong phan biet hoa thuong', async ({ api }) => {
    // Arrange
    const expected = await api.listTeams({ page: 1, size: PAGE_SIZE, teamName: PARTIAL_NAME });
    test.skip(expected.total === 0, `Khong con team nao chua "${PARTIAL_NAME}" tren moi truong test`);
    await screen.goto({ page: 1, size: PAGE_SIZE });

    // Act + Assert: chu thuong va chu hoa deu ra cung ket qua voi tu khoa goc
    for (const term of [PARTIAL_NAME.toLowerCase(), PARTIAL_NAME.toUpperCase()]) {
      await screen.search(term);
      expect(await screen.tableRows(), `Tu khoa "${term}"`).toEqual(expected.results.map(toTeamRow));
    }
  });

  test('[RON-TEAM-006] Tim ten team khong ton tai thi hien "Khong co du lieu"', async () => {
    // Arrange
    await screen.goto({ page: 1, size: PAGE_SIZE });

    // Act
    await screen.search(NOT_FOUND_NAME);

    // Assert
    await expect(screen.page.getByText(NO_DATA_TEXT)).toBeVisible();
    await expect(screen.rows).toHaveCount(0);
  });

  test('[RON-TEAM-007] Tu khoa co ky tu dac biet duoc encode tren URL, khong loi, khong render HTML', async () => {
    // Arrange
    await screen.goto({ page: 1, size: PAGE_SIZE });

    // Act
    await screen.search(SPECIAL_CHARS);

    // Assert: % va _ khong bi hieu la wildcard (khong khop moi team), the <b> khong duoc render
    expect(screen.urlQuery().teamName).toBe(SPECIAL_CHARS);
    await expect(screen.page.getByText(NO_DATA_TEXT)).toBeVisible();
    await expect(screen.rows).toHaveCount(0);
    await expect(screen.page.locator('[class*="_managementContent_"] b')).toHaveCount(0);
    await expect(screen.page.locator('[role="alert"]').filter({ visible: true })).toHaveCount(0);
  });

  test('[RON-TEAM-008] Xoa tu khoa thi bang tro lai danh sach day du', async ({ api }) => {
    // Arrange
    const all = await api.listTeams({ page: 1, size: PAGE_SIZE });
    await screen.goto({ page: 1, size: PAGE_SIZE, teamName: NOT_FOUND_NAME });
    await expect(screen.rows).toHaveCount(0);

    // Act
    await screen.search('');

    // Assert
    expect(await screen.tableRows()).toEqual(all.results.map(toTeamRow));
    await expect(screen.pageInfo).toHaveText(`1-${all.results.length} trên ${all.total}`);
  });

  test('[RON-TEAM-009] Mo URL co san teamName thi o tim dien san tu khoa va bang da loc', async ({ api }) => {
    // Arrange
    const expected = await api.listTeams({ page: 1, size: PAGE_SIZE, teamName: PARTIAL_NAME });

    // Act
    await screen.goto({ page: 1, size: PAGE_SIZE, teamName: PARTIAL_NAME });

    // Assert
    await expect(screen.searchInput).toHaveValue(PARTIAL_NAME);
    expect(await screen.tableRows()).toEqual(expected.results.map(toTeamRow));
  });

  test('[RON-TEAM-010] Bam 👁 thi modal Danh sach thanh vien hien dung ID / Ten tai khoan / Ho ten theo API, dong duoc', async ({ api }) => {
    // Arrange
    await screen.goto({ page: 1, size: PAGE_SIZE });
    await expect(screen.rows.first()).toBeVisible();

    // Act
    const teamId = await screen.openMembers(0);

    // Assert
    const { results } = await api.listTeams({ page: 1, size: PAGE_SIZE });
    expect(teamId, 'Modal goi API thanh vien cua dung team dong dau').toBe(results[0].id);
    const members = await api.listTeamMembers(teamId);
    await expect(screen.memberModal.locator('h1')).toHaveText(MEMBER_MODAL_TITLE);
    expect(await screen.memberHeaders()).toEqual(['ID', 'Tên tài khoản', 'Họ tên']);
    expect(await screen.memberRows()).toEqual(members.map(toMemberRow));
    await screen.closeMembers();
  });
});
