# AI-assisted web testing with Playwright and Claude

[![tests](../../actions/workflows/tests.yml/badge.svg)](../../actions/workflows/tests.yml)

This project shows how a large language model can make end-to-end web tests easier to write
and less brittle. It uses Playwright Test (TypeScript) with Claude through the official
Anthropic SDK, and it runs against the public demo shop [saucedemo.com](https://www.saucedemo.com).

```ts
test('complete checkout end to end', async ({ page, ai }) => {
  await page.goto('/');
  await ai.act('Log in as standard_user / secret_sauce');
  await ai.act('Add the Bike Light to the cart, then open the cart and start checkout');
  await ai.act('Fill the checkout form with first name Ada, last name Lovelace, zip 10115 and continue');
  await ai.act('Finish the order');
  await ai.assert('The page confirms the order was placed successfully');
});
```

## What it demonstrates

| Technique | API | What it solves |
|---|---|---|
| **Natural-language steps** | `ai.act("…")` | Write steps in plain English; the model picks the elements. |
| **Self-healing locators** | `ai.locator(selector, description)` | When a selector breaks after a UI change, the model finds the element and suggests a durable replacement selector. |
| **Visual / semantic assertions** | `ai.assert("…")`, `ai.check("…")` | Checks that selectors can't express: "every product shows a distinct photo", "this looks like an error". |
| **Structured extraction** | `ai.extract("…", zodSchema)` | Pull typed data off a page, then assert on it with plain `expect`. |
| **Deterministic replays** | response cache | The same page and prompt replay a cached answer: faster, free, and repeatable. |

The highlight is [`visual-and-data.spec.ts`](tests/ai/visual-and-data.spec.ts). saucedemo's
`problem_user` shows the same dog photo for every product. A selector-based test passes,
because the `<img>` tags exist. The AI visual check catches the bug.

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env        # add your ANTHROPIC_API_KEY
npm test
```

Without an API key, the baseline and offline suites still run and the AI suite is skipped.

| Command | Runs | Needs a key |
|---|---|---|
| `npm run test:baseline` | Classic Playwright tests, the control group | No |
| `npm run test:offline` | The AI helpers against a scripted fake model and local HTML | No |
| `npm run test:ai` | Real AI tests against saucedemo.com | Yes |
| `npm run report` | Opens the HTML report (traces, screenshots, heal reports) | No |

Set `AI_DEBUG=1` to print every decision the model makes.

## Project layout

```
src/
  ai/
    provider.ts     Claude client, structured outputs, response cache
    snapshot.ts     Turns the page into a numbered list of interactive elements
    AiHelper.ts     act / check / assert / extract / locator
  pages/            Classic page objects, used by the baseline suite
  fixtures.ts       The `ai` Playwright fixture
tests/
  baseline/         Plain Playwright, no AI
  ai/               AI-assisted tests (skipped without a key)
  offline/          Unit-style tests of the AI layer with a fake model
docs/
  ARCHITECTURE.md   How the pieces fit together
  HOW-IT-WORKS.md   Explanation of each technique, its prompts, and trade-offs
  WRITING-TESTS.md  Guide and best practices for adding tests
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): components, data flow, and design decisions
- [How it works](docs/HOW-IT-WORKS.md): each technique explained, with cost, speed and reliability trade-offs
- [Writing tests](docs/WRITING-TESTS.md): when to use AI and when not to, with patterns and anti-patterns

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Enables the AI suite |
| `AI_MODEL` | `claude-opus-5-5` | Model used for every AI call |
| `AI_EFFORT` | `low` | Reasoning effort (`low` … `max`); `low` is fast and enough for UI steps |
| `AI_CACHE` | on | Set to `off` to always call the model |
| `AI_DEBUG` | off | Log AI decisions to the console |

## CI

[`.github/workflows/tests.yml`](.github/workflows/tests.yml) runs the type check and every suite
on each push and pull request. To enable the AI suite in CI, add `ANTHROPIC_API_KEY` as a
repository secret. Without it, the AI tests are reported as skipped.

## License

MIT
