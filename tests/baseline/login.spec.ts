import { expect, test } from '@playwright/test';
import { USERS } from '../../src/fixtures';
import { LoginPage } from '../../src/pages/LoginPage';

test.describe('login (classic Playwright)', () => {
  test('standard user reaches the inventory', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.standard, USERS.password);
    await expect(page).toHaveURL(/inventory\.html/);
    await expect(page.locator('[data-test="inventory-item"]')).toHaveCount(6);
  });

  test('locked out user sees an error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.lockedOut, USERS.password);
    await expect(login.error).toContainText('locked out');
  });

  test('add backpack to cart', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.standard, USERS.password);
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
  });
});
