import { z } from 'zod';
import { expect, test, USERS } from '../../src/fixtures';
import { LoginPage } from '../../src/pages/LoginPage';

test.describe('AI assertions and extraction', () => {
  test('visual check passes for the standard user', async ({ page, ai }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.standard, USERS.password);
    await ai.assert('Every product card shows a distinct product photo that matches its name');
  });

  test('visual check catches the broken images of problem_user', async ({ page, ai }) => {
    // problem_user is saucedemo's built-in buggy account: every product shows the same dog photo.
    // A selector-based test passes here because the <img> tags exist. A visual check does not.
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.problem, USERS.password);
    const verdict = await ai.check('Every product card shows a distinct product photo that matches its name');
    expect(verdict.pass, verdict.reasoning).toBe(false);
  });

  test('extract prices and verify "Price (low to high)" sorting', async ({ page, ai }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.standard, USERS.password);
    await page.locator('[data-test="product-sort-container"]').selectOption('lohi');

    const { products } = await ai.extract(
      'every product name and its price in the order they appear',
      z.object({ products: z.array(z.object({ name: z.string(), price: z.number() })) }),
    );

    expect(products).toHaveLength(6);
    const prices = products.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});
