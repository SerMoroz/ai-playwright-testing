import { expect, test, USERS } from '../../src/fixtures';

test.describe('self-healing locators', () => {
  test('recovers from selectors that no longer exist', async ({ page, ai }) => {
    await page.goto('/');

    // These selectors are deliberately wrong, as if the app was refactored after the test was written.
    await (await ai.locator('#user-name-input', 'Username field on the login form')).fill(USERS.standard);
    await (await ai.locator('#pass', 'Password field on the login form')).fill(USERS.password);
    await (await ai.locator('button.btn-login', 'Login submit button')).click();

    await expect(page).toHaveURL(/inventory\.html/);

    // Each heal is recorded with a durable replacement selector for the test author.
    expect(ai.heals.map((h) => h.suggestedSelector)).toEqual([
      '[data-test="username"]',
      '[data-test="password"]',
      '[data-test="login-button"]',
    ]);
  });

  test('a working selector is used as-is, without calling the model', async ({ page, ai }) => {
    await page.goto('/');
    await (await ai.locator('[data-test="username"]', 'Username field')).fill(USERS.standard);
    expect(ai.heals).toHaveLength(0);
  });
});
