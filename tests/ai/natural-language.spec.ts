import { expect, test, USERS } from '../../src/fixtures';

test.describe('natural-language steps', () => {
  test('log in and add an item, written in plain English', async ({ page, ai }) => {
    await page.goto('/');
    await ai.act(`Log in with username "${USERS.standard}" and password "${USERS.password}"`);
    await expect(page).toHaveURL(/inventory\.html/);

    await ai.act('Add the Sauce Labs Backpack to the cart');
    // Mix AI steps with ordinary assertions: the AI drives, Playwright verifies.
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
  });

  test('complete checkout end to end', async ({ page, ai }) => {
    await page.goto('/');
    await ai.act(`Log in as ${USERS.standard} / ${USERS.password}`);
    await ai.act('Add the Bike Light to the cart, then open the cart and start checkout');
    await ai.act('Fill the checkout form with first name Ada, last name Lovelace, zip 10115 and continue');
    await ai.act('Finish the order');
    await ai.assert('The page confirms the order was placed successfully');
  });
});
