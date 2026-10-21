import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://www.saucedemo.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    // Plain Playwright tests: the control group.
    { name: 'baseline', testDir: './tests/baseline' },
    // Tests that call Claude. Skipped when no API key is set.
    { name: 'ai', testDir: './tests/ai', timeout: 120_000 },
    // AI plumbing tested against a scripted fake model and local HTML. No network, no key.
    { name: 'offline', testDir: './tests/offline' },
  ],
});
