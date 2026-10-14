import { expect, type Locator, type Page } from '@playwright/test';
import type { UserInfo } from '../utils/ron-api-client';

/**
 * Page Object cho man "Trang ca nhan" (/profile) - doc 03. Chi hien ho so cua user dang dang nhap,
 * du lieu tu GET /api/user/info. Thao tac duy nhat: "Thay anh (1MB)" - chon file la upload ngay
 * (POST /api/files/avatar, multipart), khong co buoc xac nhan.
 * Icon sua (tooltip "Cap nhat thong tin") bam khong mo gi (do 12/10).
 */

export const PROFILE_PATH = '/profile';
export const AVATAR_UPLOAD_PATH = '/api/files/avatar';
const USER_INFO_PATH = '/api/user/info';

/** Gioi han anh dai dien phia client: dung 1MB van gui, 1MB + 1 byte bi chan (do 12/10). */
export const AVATAR_MAX_BYTES = 1024 * 1024;
export const AVATAR_TOO_LARGE_TOAST = 'Kích thước tệp không được vượt quá 1MB!';
export const NETWORK_ERROR_TOAST = 'Lỗi kết nối, xin vui lòng thử lại!';
export const EDIT_TOOLTIP = 'Cập nhật thông tin';

/** Nhan cac field khoi "Thong tin chung", dung thu tu tren man. */
export const GENERAL_INFO_LABELS = [
  'Họ tên',
  'Email',
  'Vai trò đặc biệt',
  'Giới tính',
  'Loại hợp đồng',
  'Ngày nhân viên chính thức',
  'Ngày sinh',
  'Số điện thoại',
] as const;
export type GeneralInfoLabel = (typeof GENERAL_INFO_LABELS)[number];

/** Nhan hien thi cua enum API. Chi gom gia tri da thay tren dev; gap gia tri moi -> bo sung. */
export const GENDER_LABELS: Record<string, string> = { MALE: 'Nam', FEMALE: 'Nữ' };
export const CONTRACT_TYPE_LABELS: Record<string, string> = { STAFF: 'Chính thức' };

/** 'yyyy-MM-dd' -> 'dd-MM-yyyy' (dinh dang ngay tren man). */
export const toProfileDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('-') : '');

export interface AvatarUploadResult {
  /** Client co gui POST /api/files/avatar khong (request bi chan, khong toi server). */
  requestSent: boolean;
  toasts: string[];
}

export class UserProfilePage {
  readonly page: Page;
  readonly nameHeading: Locator;
  readonly avatarImage: Locator;
  readonly changeAvatarButton: Locator;
  readonly fileInput: Locator;
  readonly editButton: Locator;
  readonly infoLabels: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameHeading = page.locator('[class*="_ronNameInfo_"]');
    this.avatarImage = page.locator('[class*="_ronAvatar_"] img');
    this.changeAvatarButton = page.locator('label[for="inputFile"]');
    this.fileInput = page.locator('#inputFile');
    this.editButton = page.locator('[class*="_ronEditBtn_"]');
    this.infoLabels = page.locator('[class*="_ronItemLabel_"]');
  }

  /** Chay `action` (mo man), doi GET /api/user/info; tra ve data API lam oracle. */
  async waitForProfile(action: () => Promise<unknown>): Promise<UserInfo> {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === USER_INFO_PATH,
    );
    await action();
    const body = (await (await response).json()) as { data: UserInfo };
    await this.page.waitForLoadState('networkidle');
    await expect(this.nameHeading).toHaveText(body.data.username);
    return body.data;
  }

  goto(): Promise<UserInfo> {
    return this.waitForProfile(() => this.page.goto(PROFILE_PATH));
  }

  /** Gia tri hien thi cua 1 field khoi "Thong tin chung". */
  fieldValue(label: GeneralInfoLabel): Promise<string> {
    return this.page
      .locator('[class*="_ronGridItem_"]')
      .filter({ has: this.page.locator(':scope > [class*="_ronItemLabel_"]', { hasText: new RegExp(`^${label}$`) }) })
      .locator('[class*="_ronItemValue_"]')
      .innerText();
  }

  async editTooltip(): Promise<string[]> {
    await this.editButton.hover();
    const tooltip = this.page.locator('[role="tooltip"]');
    await expect(tooltip.first()).toBeVisible();
    return tooltip.allInnerTexts();
  }

  /**
   * Chon file anh dai dien. POST /api/files/avatar bi CHAN (abort) truoc khi toi server -> khong doi
   * avatar that cua account test; chi kiem validate phia client. Route dang ky sau writeGuard nen
   * duoc xu ly truoc, writeGuard khong thay request nay.
   */
  async chooseAvatarFile(file: { name: string; mimeType: string; size: number }): Promise<AvatarUploadResult> {
    let requestSent = false;
    const handler = async (route: import('@playwright/test').Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      requestSent = true;
      return route.abort();
    };
    await this.page.route(`**${AVATAR_UPLOAD_PATH}`, handler);
    try {
      await this.fileInput.setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: Buffer.alloc(file.size, 1) });
      const toast = this.page.locator('.Toastify [role="alert"]').filter({ visible: true });
      await toast.first().waitFor({ timeout: 8_000 }).catch(() => {});
      const toasts = [...new Set((await toast.allInnerTexts()).map((t) => t.trim()).filter(Boolean))];
      return { requestSent, toasts };
    } finally {
      await this.page.unroute(`**${AVATAR_UPLOAD_PATH}`, handler);
    }
  }
}
