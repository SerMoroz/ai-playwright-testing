import { test as base, expect } from '@playwright/test';
import { AiHelper } from './ai/AiHelper';
import { defaultProvider, hasCredentials } from './ai/provider';

/** Public demo credentials published on saucedemo.com's login page. */
export const USERS = {
  standard: 'standard_user',
  lockedOut: 'locked_out_user',
  problem: 'problem_user',
  password: 'secret_sauce',
} as const;

export const test = base.extend<{ ai: AiHelper }>({
  ai: async ({ page }, use, testInfo) => {
    testInfo.skip(!hasCredentials(), 'Set ANTHROPIC_API_KEY to run AI tests');
    const ai = new AiHelper(page, defaultProvider(), testInfo);
    await use(ai);
    if (ai.heals.length) {
      await testInfo.attach('self-healing-report.json', {
        body: JSON.stringify(ai.heals, null, 2),
        contentType: 'application/json',
      });
    }
  },
});

export { expect };
