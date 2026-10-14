import { expect, type Locator, type Page } from '@playwright/test';
import { ronModal } from './ron-modal-form-controls';
import type { Team, TeamMember } from '../utils/ron-api-client';

/**
 * Page Object cho man "Danh sach team" (/team-management) - doc 11. Voi nhan vien man CHI DOC.
 * O "Ten team" tim ngay khi go (debounce, server-side), dong bo query teamName tren URL.
 * Bang: Anh | Ten team | Email | Mo ta | Trang thai | Tuy chinh (👁 -> modal "Danh sach thanh vien").
 */

export const TEAM_MANAGEMENT_PATH = '/team-management';
export const NO_DATA_TEXT = 'Không có dữ liệu';
export const MEMBER_MODAL_TITLE = 'Danh sách thành viên';
const TEAMS_API = '/api/manage/teams';
const MEMBERS_API = /^\/api\/manage\/teamMemberships\/\d+\/members$/;

/** Nhan badge Trang thai. Status moi chua map -> giu nguyen gia tri de test fail ro rang. */
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Hoạt động' };

export interface TeamRow {
  name: string;
  email: string;
  description: string;
  status: string;
}

export interface MemberRow {
  id: string;
  username: string;
  fullName: string;
}

/**
 * Dong bang mong doi tu 1 team cua API (email/mo ta null hien rong).
 * Du lieu that co khoang trang thua (vd email "all@i3design.vn ") -> trim nhu o bang.
 */
export const toTeamRow = (t: Team): TeamRow => ({
  name: t.name.trim(),
  email: (t.email ?? '').trim(),
  description: (t.description ?? '').trim(),
  status: STATUS_LABEL[t.status] ?? t.status,
});

/** Dong modal mong doi tu 1 thanh vien cua API: Ho ten = "<lastName> <firstName>". */
export const toMemberRow = (m: TeamMember): MemberRow => ({
  id: String(m.id),
  username: m.username.trim(),
  fullName: `${m.lastName.trim()} ${m.firstName.trim()}`.trim(),
});

/** Text tung o cua cac dong `tbody tr` trong `table`. */
function readCells(table: Locator): Promise<string[][]> {
  return table
    .locator('tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())));
}

export class TeamManagementPage {
  readonly page: Page;
  readonly searchInput: Locator;
  /** Bang chinh (khong lan voi bang trong modal). */
  readonly table: Locator;
  readonly rows: Locator;
  readonly pageInfo: Locator;
  /** Pager: [ve trang dau, trang truoc, trang sau, trang cuoi] - nut khong co ten accessible. */
  readonly pagerButtons: Locator;
  readonly memberModal: Locator;

  constructor(page: Page) {
    this.page = page;
    const content = page.locator('[class*="_managementContent_"]');
    this.searchInput = content.locator('input[placeholder="Điền tên team"]');
    this.table = content.locator('table');
    this.rows = this.table.locator('tbody tr');
    this.pageInfo = page.locator('[class*="_pageInfo_"]');
    this.pagerButtons = this.pageInfo.locator('xpath=following-sibling::button');
    this.memberModal = ronModal(page, MEMBER_MODAL_TITLE);
  }

  /** Mo man, co the kem query (page/size/teamName). Doi API danh sach tra ve. */
  async goto(query: Record<string, string | number> = {}) {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    await this.waitForList(() => this.page.goto(qs ? `${TEAM_MANAGEMENT_PATH}?${qs}` : TEAM_MANAGEMENT_PATH));
  }

  /**
   * Chay `action` va doi response GET /api/manage/teams ma no gay ra.
   * `teamName`: chi nhan response co dung tu khoa nay (o tim debounce, bo qua request cu); '' = khong tu khoa.
   */
  async waitForList(action: () => Promise<unknown>, teamName?: string) {
    const response = this.page.waitForResponse((r) => {
      const url = new URL(r.url());
      if (r.request().method() !== 'GET' || url.pathname !== TEAMS_API) return false;
      return teamName === undefined || (url.searchParams.get('teamName') ?? '') === teamName;
    });
    await action();
    await response;
    await this.page.waitForLoadState('networkidle');
  }

  /** Go tu khoa vao o "Ten team" (thay noi dung cu) va doi danh sach loc theo tu khoa do. */
  async search(teamName: string) {
    await this.waitForList(() => this.searchInput.fill(teamName), teamName);
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.table.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  /** Cac dong bang chinh, bo cot Anh va Tuy chinh. */
  async tableRows(): Promise<TeamRow[]> {
    return (await readCells(this.table)).map(([, name, email, description, status]) => ({ name, email, description, status }));
  }

  /** Bam 👁 cua dong thu `index`, doi API thanh vien tra ve va modal hien dong. Tra ve teamId da goi. */
  async openMembers(index: number): Promise<number> {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && MEMBERS_API.test(new URL(r.url()).pathname),
    );
    await this.rows.nth(index).locator('button').click();
    const teamId = Number(new URL((await response).url()).pathname.split('/')[4]);
    await expect(this.memberModal.locator('h1', { hasText: MEMBER_MODAL_TITLE })).toBeVisible();
    return teamId;
  }

  async memberHeaders(): Promise<string[]> {
    return (await this.memberModal.locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  async memberRows(): Promise<MemberRow[]> {
    return (await readCells(this.memberModal.locator('table'))).map(([id, username, fullName]) => ({ id, username, fullName }));
  }

  /** Modal chi co 1 nut (dong). */
  async closeMembers() {
    await this.memberModal.locator('[class*="_btn_"]').click();
    await expect(this.memberModal).toBeHidden();
  }

  /** Query page/size/teamName dang co tren URL. */
  urlQuery(): Record<string, string | null> {
    const params = new URL(this.page.url()).searchParams;
    return Object.fromEntries(['page', 'size', 'teamName'].map((k) => [k, params.get(k)]));
  }

  nextPageButton(): Locator {
    return this.pagerButtons.nth(2);
  }
}
