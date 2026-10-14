import { expect, test } from '../../fixtures/employee-session-fixture';
import {
  AVATAR_MAX_BYTES,
  AVATAR_TOO_LARGE_TOAST,
  CONTRACT_TYPE_LABELS,
  EDIT_TOOLTIP,
  GENDER_LABELS,
  GENERAL_INFO_LABELS,
  NETWORK_ERROR_TOAST,
  PROFILE_PATH,
  toProfileDate,
  UserProfilePage,
} from '../../pages/user-profile-page';

// Man "Trang ca nhan" (doc 03) - CHI DOC. Upload anh dai dien: request POST /api/files/avatar bi chan
// truoc khi toi server (chooseAvatarFile) -> khong doi avatar that, chi kiem validate phia client.
// Upload anh hop le that su chua tu dong hoa: se doi avatar cua account test tren moi truong dung chung.

/** Username nguoi khac de thu xem ho so qua query URL (doc 03: chi xem duoc cua minh). */
const OTHER_USERNAME = process.env.RON_OTHER_USERNAME || 'admin';

test.describe('Trang ca nhan - xem ho so va doi anh dai dien', () => {
  let profile: UserProfilePage;

  test.beforeEach(async ({ employeePage }) => {
    profile = new UserProfilePage(employeePage);
  });

  test('[RON-PROFILE-001] Bam avatar o sidebar thi mo Trang ca nhan cua chinh minh @smoke', async ({ employeePage }) => {
    // Arrange
    await employeePage.goto('/');
    const sidebarProfileLink = employeePage.locator(`a[href="${PROFILE_PATH}"]`);

    // Act
    const info = await profile.waitForProfile(() => sidebarProfileLink.locator('img').click());

    // Assert
    await expect(employeePage).toHaveURL(new RegExp(`${PROFILE_PATH}$`));
    expect(info.username).toBe(process.env.RON_USERNAME);
    await expect(profile.avatarImage).toHaveAttribute('src', info.avatar ?? '');
    await expect(profile.changeAvatarButton).toHaveText('Thay ảnh (1MB)');
    expect((await profile.infoLabels.allInnerTexts()).map((t) => t.trim())).toEqual([...GENERAL_INFO_LABELS]);
  });

  test('[RON-PROFILE-002] Khoi Thong tin chung hien dung du lieu API user/info', async () => {
    // Act
    const info = await profile.goto();

    // Assert
    expect(await profile.fieldValue('Họ tên')).toBe(info.fullName);
    expect(await profile.fieldValue('Email')).toBe(info.email);
    expect(GENDER_LABELS[info.gender], `Chua biet nhan hien thi cua gender ${info.gender}`).toBeDefined();
    expect(await profile.fieldValue('Giới tính')).toBe(GENDER_LABELS[info.gender]);
    expect(CONTRACT_TYPE_LABELS[info.contractType], `Chua biet nhan hien thi cua contractType ${info.contractType}`).toBeDefined();
    expect(await profile.fieldValue('Loại hợp đồng')).toBe(CONTRACT_TYPE_LABELS[info.contractType]);
    expect(await profile.fieldValue('Ngày nhân viên chính thức')).toBe(toProfileDate(info.contractDate));
    if (!info.roles.length) expect(await profile.fieldValue('Vai trò đặc biệt')).toBe('');
    // Du lieu ca nhan: so sanh boolean de log/report khong in gia tri that
    expect((await profile.fieldValue('Ngày sinh')) === toProfileDate(info.birthday), 'Ngay sinh khong khop API').toBe(true);
    expect((await profile.fieldValue('Số điện thoại')) === (info.phoneNumber ?? ''), 'So dien thoai khong khop API').toBe(true);
  });

  test('[RON-PROFILE-003] Them username nguoi khac vao URL van chi hien ho so cua minh', async ({ api, employeePage }) => {
    // Arrange
    const me = await api.userInfo();

    // Act
    const shown = await profile.waitForProfile(() => employeePage.goto(`${PROFILE_PATH}?username=${OTHER_USERNAME}`));

    // Assert
    expect(shown.username).toBe(me.username);
    expect(await profile.fieldValue('Email')).toBe(me.email);
  });

  // Doc 03 diem bat thuong: khong co chuc nang sua thong tin. Man van co icon sua -> ghi lai hanh vi
  // hien tai (khong mo gi, khong gui request); khi dev lam chuc nang sua -> doi assertion.
  test('[RON-PROFILE-004] Icon Cap nhat thong tin co tooltip nhung bam khong mo gi', async ({ employeePage, writeGuard }) => {
    test.info().annotations.push({ type: 'known-issue', description: 'Icon sua ho so khong co chuc nang (can xac nhan PO)' });

    // Arrange
    await profile.goto();
    expect(await profile.editTooltip()).toContain(EDIT_TOOLTIP);
    const writes: string[] = [];
    const onRequest = (r: import('@playwright/test').Request) => {
      if (r.method() !== 'GET' && r.method() !== 'OPTIONS') writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    };
    employeePage.on('request', onRequest);

    // Act
    await profile.editButton.click();
    await employeePage.waitForTimeout(1_000); // cho man co thoi gian mo modal / dieu huong neu co

    // Assert
    employeePage.off('request', onRequest);
    await expect(employeePage).toHaveURL(new RegExp(`${PROFILE_PATH}$`));
    await expect(employeePage.locator('[class*="_modalContainer_"]')).toHaveCount(0);
    await expect(employeePage.locator('[class*="_pageContent_"] input:not([type="file"]), [class*="_pageContent_"] textarea')).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(writeGuard).toEqual([]);
  });

  test('[RON-PROFILE-005] Anh lon hon 1MB thi bao loi kich thuoc, khong goi API upload', async () => {
    // Arrange
    await profile.goto();

    // Act
    const result = await profile.chooseAvatarFile({ name: 'AUTOTEST_big.png', mimeType: 'image/png', size: AVATAR_MAX_BYTES + 1 });

    // Assert
    expect(result.requestSent, 'Client phai chan file > 1MB').toBe(false);
    expect(result.toasts).toContain(AVATAR_TOO_LARGE_TOAST);
  });

  test('[RON-PROFILE-006] Anh dung 1MB qua duoc validate client va upload ngay khong can xac nhan', async () => {
    // Arrange
    const before = await profile.goto();

    // Act
    const result = await profile.chooseAvatarFile({ name: 'AUTOTEST_exact.png', mimeType: 'image/png', size: AVATAR_MAX_BYTES });

    // Assert: request duoc gui (bi chan o tang mang -> app bao loi ket noi), khong bao loi kich thuoc
    expect(result.requestSent, 'File dung 1MB phai duoc gui len server').toBe(true);
    expect(result.toasts).not.toContain(AVATAR_TOO_LARGE_TOAST);
    expect(result.toasts).toContain(NETWORK_ERROR_TOAST);
    // Request khong toi server -> avatar khong doi
    const after = await profile.goto();
    expect(after.avatar).toBe(before.avatar);
  });

  // Doc 03 diem bat thuong: chi loc dinh dang bang thuoc tinh accept (bo qua duoc), client khong kiem
  // lai truoc khi upload. Ghi lai hanh vi hien tai; server co chan dinh dang hay khong: chua kiem chung.
  test('[RON-PROFILE-007] File .txt dua thang vao input van duoc client gui upload', async () => {
    test.info().annotations.push({ type: 'known-issue', description: 'Client khong validate dinh dang anh ngoai accept' });

    // Arrange
    await profile.goto();
    await expect(profile.fileInput).toHaveAttribute('accept', '.png, .jpg, .jpeg');

    // Act
    const result = await profile.chooseAvatarFile({ name: 'AUTOTEST_note.txt', mimeType: 'text/plain', size: 10 });

    // Assert
    expect(result.requestSent, 'Hanh vi hien tai: client khong chan dinh dang').toBe(true);
    expect(result.toasts).not.toContain(AVATAR_TOO_LARGE_TOAST);
  });
});
