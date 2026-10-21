# Writing tests

## Template

```ts
import { expect, test, USERS } from '../../src/fixtures';

test('user can sort products by price', async ({ page, ai }) => {
  await page.goto('/');
  await ai.act(`Log in as ${USERS.standard} / ${USERS.password}`);       // AI: setup
  await page.locator('[data-test="product-sort-container"]').selectOption('lohi'); // scripted: the step under test
  const first = page.locator('[data-test="inventory-item-price"]').first();
  await expect(first).toHaveText('$7.99');                                // exact assertion
  await ai.assert('Products are listed from cheapest to most expensive'); // AI: extra semantic check
});
```

Import `test` and `expect` from `src/fixtures`, not from `@playwright/test`, to get the `ai` fixture.

## Choosing the right tool

| You want to… | Use |
|---|---|
| Verify an exact value, count, URL or text | `expect` |
| Do setup or navigation that isn't under test | `ai.act()` |
| Keep a test working while the UI is being refactored | `ai.locator()` |
| Check layout, images, or "does this look broken" | `ai.assert()` |
| Get a list of values to compute on | `ai.extract()` + `expect` |

## Good and bad instructions

| Avoid | Prefer | Why |
|---|---|---|
| `ai.act('buy something')` | `ai.act('Add the Bike Light to the cart')` | Name the exact target |
| `ai.act('do the whole checkout and verify it')` | Several `act` calls, then `assert` | Short steps are easier to debug and to cache |
| `ai.assert('page is fine')` | `ai.assert('The cart badge shows 2')` | One concrete claim the model can check |
| `ai.locator('#x', 'button')` | `ai.locator('#x', 'Checkout button in the cart footer')` | Brief it the way you would brief a manual tester |

## Debugging

- `AI_DEBUG=1 npm run test:ai`: prints every step and verdict, with the model's reasoning.
- `npm run report`: open a failed test to see the trace, the `ai-check` screenshots, and any
  `self-healing-report.json`.
- `AI_CACHE=off`: rule out a stale cached answer.
- An `act()` that gives up throws its full step history, including each failed action.

## Testing the AI layer itself

`tests/offline` drives `AiHelper` with `ScriptedProvider`, a fake model that returns queued
answers, against local HTML set with `page.setContent`. Add a test there when you change
prompts, the snapshot format, or the helper logic. These tests run in CI without a key.
