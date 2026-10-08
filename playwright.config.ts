import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Chay tuan tu: 1 trinh duyet, xong case nay moi sang case sau (theo thu tu trong file).
  // BAT BUOC 1 worker: test tao don that tren 1 account dung chung (han muc, ngay trung) va don dep
  // theo tien to AUTOTEST_ RON- -> chay song song se huy don cua worker khac. Fixture chan workers > 1.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: process.env.RON_BASE_URL || 'https://ron-dev.nal.vn',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Local: dung Google Chrome da cai tren may (Playwright >= 1.63 khong ho tro
        // Chromium bundled tren macOS 13). CI: image Playwright co san Chromium bundled.
        // PW_CHANNEL=chrome: ep dung Chrome cai san (self-hosted runner macOS).
        channel: process.env.PW_CHANNEL || (isCI ? undefined : 'chrome'),
        // SLOWMO=500 → cham moi thao tac 500ms de nhin bang mat khi chay headed.
        launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
      },
    },
  ],
});
