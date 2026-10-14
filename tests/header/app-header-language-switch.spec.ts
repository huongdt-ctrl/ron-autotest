import type { Page, Request } from '@playwright/test';
import { expect, test } from '../../fixtures/employee-session-fixture';
import { AppHeaderPage, HEADER_LABELS } from '../../pages/app-header-page';
import { REQUEST_LIST_PATH } from '../../pages/work-time-request-list-page';

// Header (doc 12) - dropdown ngon ngu. Doi ngon ngu chi o client (localStorage i18nextLng), khong ghi server.
// <html lang> la gia tri tinh "en" trong index.html (khong doi theo ngon ngu) -> khong dung de assert.
// Trinh duyet dung chung -> afterEach tra ve tieng Viet de case sau (va spec khac) van thay nhan VI.

/** Nhan quan sat duoc tren man Don dang ky (doc 12 "Tu dien nhan VI -> EN"). */
const REQUEST_LIST_LABELS = {
  vi: {
    columns: ['Thời gian đăng ký', 'Lí do', 'Người kiểm duyệt', 'Loại đơn', 'Trạng thái', 'Tùy chỉnh'],
    buttons: ['Tạo đơn', 'Thống kê', 'Đăng xuất'],
    sidebar: ['Trang cá nhân', 'Trang chủ', 'Nghỉ phép, Remote, OT', 'Chấm công', 'Nhân sự'],
  },
  // Hanh vi hien tai: "Censor" / "Staff information" / "Add" la ban dich sai (doc 12 diem bat thuong 3).
  // Neu dev sua ban dich thi cap nhat mang nay theo nhan moi.
  en: {
    columns: ['Registration time', 'Reason', 'Censor', 'Type', 'Status', 'Actions'],
    buttons: ['Add', 'Statistics', 'Logout'],
    sidebar: ['Profile', 'Dashboard', 'Leave, Remote, OT', 'Timekeeping', 'Staff information'],
  },
} as const;

/** Ghi lai request (method + path) trong luc chay `action`. */
async function captureRequests(page: Page, action: () => Promise<unknown>): Promise<string[]> {
  const calls: string[] = [];
  const onRequest = (r: Request) => calls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  page.on('request', onRequest);
  try {
    await action();
    await page.waitForLoadState('networkidle');
  } finally {
    page.off('request', onRequest);
  }
  return calls;
}

test.describe('Header - doi ngon ngu', () => {
  let header: AppHeaderPage;

  test.beforeEach(async ({ employeePage }) => {
    header = new AppHeaderPage(employeePage);
    await employeePage.goto(REQUEST_LIST_PATH);
    await header.resetLanguage();
    // Doi request tai trang xong de captureRequests chi bat request do thao tac doi ngon ngu gay ra.
    await employeePage.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await header.resetLanguage();
  });

  /** Kiem tra nhan header + man Don dang ky + sidebar dung theo ngon ngu `lang`. */
  async function expectLabels(page: Page, lang: 'vi' | 'en') {
    await expect(header.remoteCheckInButton).toHaveText(HEADER_LABELS[lang].remoteCheckIn);
    await expect(header.languageValue).toHaveText(HEADER_LABELS[lang].selected);
    await expect(page.locator('thead th')).toHaveText([...REQUEST_LIST_LABELS[lang].columns]);
    for (const name of REQUEST_LIST_LABELS[lang].buttons) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    for (const text of REQUEST_LIST_LABELS[lang].sidebar) await expect(page.getByText(text, { exact: true }).first()).toBeAttached();
  }

  test('[RON-LANG-001] Mo dropdown thi co 2 option "Tieng Viet" (dang chon) va "Tieng Anh" @smoke', async () => {
    // Act
    await header.openLanguageMenu();

    // Assert
    expect(await header.languageOptionTexts()).toEqual([...HEADER_LABELS.vi.options]);
    expect(await header.selectedOptionTexts()).toEqual([HEADER_LABELS.vi.selected]);
  });

  test('[RON-LANG-002] Chon Tieng Anh thi doi ngay o client: chi tai /locales/en, khong goi /api/, luu i18nextLng=en @smoke', async ({ employeePage }) => {
    // Act
    const calls = await captureRequests(employeePage, () => header.chooseLanguage('Tiếng Anh'));

    // Assert
    expect(calls.filter((c) => c.includes('/api/')), 'Khong goi API khi doi ngon ngu').toEqual([]);
    expect(calls.filter((c) => c.includes('/locales/')).sort()).toEqual(['GET /locales/en/app.json', 'GET /locales/en/common.json']);
    expect(await header.storedLanguage()).toBe('en');
    await expect(employeePage).toHaveURL(new RegExp(REQUEST_LIST_PATH)); // khong reload / doi man
  });

  test('[RON-LANG-003] Sau khi chon Tieng Anh, header, sidebar va man Don dang ky hien nhan tieng Anh', async ({ employeePage }) => {
    // Act
    await header.chooseLanguage('Tiếng Anh');

    // Assert
    await expectLabels(employeePage, 'en');
    await expect(employeePage.getByText('Work time management', { exact: true }).first()).toBeVisible();
  });

  test('[RON-LANG-004] O ban tieng Anh, option dropdown la "Vietnamese" / "English" (dang chon)', async () => {
    // Arrange
    await header.chooseLanguage('Tiếng Anh');

    // Act
    await header.openLanguageMenu();

    // Assert
    expect(await header.languageOptionTexts()).toEqual([...HEADER_LABELS.en.options]);
    expect(await header.selectedOptionTexts()).toEqual([HEADER_LABELS.en.selected]);
  });

  test('[RON-LANG-005] Reload trang van giu Tieng Anh (luu localStorage)', async ({ employeePage }) => {
    // Arrange
    await header.chooseLanguage('Tiếng Anh');

    // Act
    await employeePage.reload();

    // Assert
    expect(await header.storedLanguage()).toBe('en');
    await expectLabels(employeePage, 'en');
  });

  test('[RON-LANG-006] Chuyen sang man khac van giu Tieng Anh', async ({ employeePage }) => {
    // Arrange
    await header.chooseLanguage('Tiếng Anh');

    // Act
    await header.logo.click();
    await expect(employeePage).toHaveURL((url) => url.pathname === '/');

    // Assert
    await expect(header.remoteCheckInButton).toHaveText(HEADER_LABELS.en.remoteCheckIn);
    await expect(header.languageValue).toHaveText(HEADER_LABELS.en.selected);
  });

  test('[RON-LANG-007] Chon lai "Vietnamese" thi tro ve tieng Viet, luu i18nextLng=vi, khong goi /api/', async ({ employeePage }) => {
    // Arrange
    await header.chooseLanguage('Tiếng Anh');

    // Act
    const calls = await captureRequests(employeePage, () => header.chooseLanguage('Vietnamese'));

    // Assert
    expect(calls.filter((c) => c.includes('/api/'))).toEqual([]);
    expect(await header.storedLanguage()).toBe('vi');
    await expectLabels(employeePage, 'vi');
  });
});
