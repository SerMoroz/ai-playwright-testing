# How it works

This page explains each technique: what happens on every call, why it is built that way,
and where it breaks down.

## 1. Natural-language steps: `ai.act()`

```ts
await ai.act('Add the Sauce Labs Backpack to the cart');
```

**Loop (observe → decide → act), at most 8 steps:**

1. Snapshot the page into a numbered element list.
2. Send the model the instruction, the current URL, the steps taken so far, and the element list.
3. The model returns one action: `click`, `fill`, `select`, `press`, or `none` with `done: true`.
4. Run the action on `[data-ai-id=N]` with a 5-second timeout.
5. Add the result (`ok` or `FAILED: <reason>`) to the history and repeat.

Feeding failures back is what makes this robust. If a click lands on an element that is covered
by another one, the model sees `FAILED: element is not visible` on the next turn and picks
something else.

**When to use it:** setup steps you don't want to maintain selectors for (login, navigation,
filling long forms), and exploratory or smoke tests written by non-developers.

**When not to use it:** the core thing a test verifies. Assert that with plain `expect` so the
check stays exact and deterministic. The examples mix both on purpose.

## 2. Self-healing locators: `ai.locator()`

```ts
const button = await ai.locator('button.btn-login', 'Login submit button');
await button.click();
```

1. Try the given selector, waiting up to 2 seconds for it to attach.
2. **If it works, the model is never called.** There is no cost on the happy path.
3. If it fails, snapshot the page and ask the model which element matches the description,
   with the broken selector as a hint.
4. Build a durable selector for that element (`data-test` → `data-testid` → `id` → `name`).
5. Record a `HealEvent`. It appears as a test annotation and in `self-healing-report.json`
   in the HTML report.

The test **passes but says it was healed**. That's deliberate: silent healing would hide real
regressions. Review the report and update the selector in the code.

**Risk:** the model can pick the wrong element when the description is vague. Write
descriptions the way you would brief a manual tester ("Password field on the login form", not
"input"). The returned `confidence` field flags uncertain picks.

## 3. Visual and semantic assertions: `ai.assert()` / `ai.check()`

```ts
await ai.assert('Every product card shows a distinct product photo that matches its name');
```

The model receives a **full-page screenshot** and the **accessibility tree**. The system prompt
tells it to act as a strict reviewer and to answer false when the evidence is ambiguous. It
returns `{pass, reasoning}`. `assert` throws with the reasoning, and `check` returns it.

The screenshot is attached to the report under `ai-check: <statement>`, so a reviewer can see
exactly what the model saw.

**Example bug caught:** saucedemo's `problem_user` renders the same image for all six
products. Every DOM-based check passes (`img` exists, `src` is set, alt text is right). Only a
check that looks at the picture fails.

**Guidelines:**
- Write one checkable claim per assertion. "The cart badge shows 1" is better than "the page looks right".
- Prefer `expect` whenever a selector can express the check. AI assertions are for what it can't.

## 4. Structured extraction: `ai.extract()`

```ts
const { products } = await ai.extract(
  'every product name and its price in the order they appear',
  z.object({ products: z.array(z.object({ name: z.string(), price: z.number() })) }),
);
expect(prices).toEqual([...prices].sort((a, b) => a - b));
```

The model reads the accessibility tree and fills your zod schema. The API enforces the schema
with structured outputs, so `products` is fully typed. The test logic stays in ordinary,
deterministic `expect` calls.

## 5. Caching and determinism

LLM output can vary between runs. Three things keep these tests stable:

1. **Structured outputs:** the answer always has the expected shape.
2. **Response cache:** `.ai-cache/<task>-<hash>.json`, keyed on model + prompt + page state + screenshot.
   An unchanged page replays the same decision.
3. **Narrow choices:** `act` and `locator` pick from a fixed list of element ids rather than
   generating free-form selectors.

Set `AI_CACHE=off` to force fresh calls, for example in a nightly run that checks the model
still makes the same decisions.

## Cost and speed

Every AI call costs a model request, typically 1–5 seconds at `effort: low`. As a guide:

| Call | Typical requests |
|---|---|
| `ai.act()` | 1 per action, plus 1 for the final "done" |
| `ai.locator()`, selector works | 0 |
| `ai.locator()`, selector broken | 1 |
| `ai.assert()` / `ai.check()` / `ai.extract()` | 1 (assertions include a screenshot) |

Cached re-runs cost nothing. Keep the AI suite smaller than the baseline suite and use it where
it adds coverage selectors can't give.

## Limitations

- **Not a replacement for good selectors.** Healing is a safety net. Fix the code afterwards.
- **Non-zero false positives and negatives** on visual checks. Keep claims specific and review failures in the attached screenshot.
- **Data leaves the machine.** Page content and screenshots go to the Anthropic API. Don't point the AI suite at pages with real customer data.
- **Latency.** An `act()`-heavy test is slower than the equivalent scripted test.
