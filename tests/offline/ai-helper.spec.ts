import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { AiHelper } from '../../src/ai/AiHelper';
import { CachingProvider } from '../../src/ai/provider';
import { formatElements, snapshotElements } from '../../src/ai/snapshot';
import { LOGIN_HTML, ScriptedProvider } from './ScriptedProvider';

test.beforeEach(async ({ page }) => {
  await page.setContent(LOGIN_HTML);
});

test('snapshot lists interactive elements with ids and test attributes', async ({ page }) => {
  const elements = await snapshotElements(page);
  expect(elements.map((e) => e.attrs['data-test'])).toEqual(['username', 'password', 'login-button']);
  expect(formatElements(elements)).toContain('[2] <button type="submit" data-test="login-button"> "Login"');
});

test('act() runs the actions the model picks until it says done', async ({ page }) => {
  const step = (action: string, elementId: number, value = '') => ({ done: false, reasoning: 'x', action, elementId, value });
  const model = new ScriptedProvider([
    step('fill', 0, 'ada'),
    step('fill', 1, 'secret'),
    step('click', 2),
    { done: true, reasoning: 'logged in', action: 'none', elementId: -1, value: '' },
  ]);
  await new AiHelper(page, model).act('log in as ada');

  await expect(page.locator('h1')).toHaveText('Welcome, ada');
  expect(model.requests).toHaveLength(4);
  expect(model.requests[3].text).toContain('3. click [2] - ok');
});

test('act() reports a failed action back to the model', async ({ page }) => {
  const model = new ScriptedProvider([
    { done: false, reasoning: 'x', action: 'click', elementId: 99, value: '' },
    { done: true, reasoning: 'x', action: 'none', elementId: -1, value: '' },
  ]);
  await new AiHelper(page, model).act('click something');
  expect(model.requests[1].text).toContain('click [99] - FAILED');
});

test('act() gives up after maxSteps', async ({ page }) => {
  const loop = Array.from({ length: 3 }, () => ({ done: false, reasoning: 'x', action: 'click', elementId: 2, value: '' }));
  const ai = new AiHelper(page, new ScriptedProvider(loop), undefined, 3);
  await expect(ai.act('never finishes')).rejects.toThrow(/gave up after 3 steps/);
});

test('locator() heals a broken selector to a durable one', async ({ page }) => {
  const model = new ScriptedProvider([{ elementId: 2, confidence: 'high', reasoning: 'only button' }]);
  const ai = new AiHelper(page, model);

  const button = await ai.locator('#old-login', 'Login button');
  await expect(button).toHaveText('Login');
  expect(ai.heals).toEqual([
    expect.objectContaining({ brokenSelector: '#old-login', suggestedSelector: '[data-test="login-button"]' }),
  ]);
});

test('locator() does not call the model when the selector works', async ({ page }) => {
  const model = new ScriptedProvider([]);
  await new AiHelper(page, model).locator('[data-test="username"]', 'Username');
  expect(model.requests).toHaveLength(0);
});

test('assert() throws with the model reasoning on a false statement', async ({ page }) => {
  const model = new ScriptedProvider([{ pass: false, reasoning: 'No error message is visible.' }]);
  await expect(new AiHelper(page, model).assert('An error is shown')).rejects.toThrow(/No error message is visible/);
  expect(model.requests[0].imagePng?.length).toBeGreaterThan(0);
});

test('CachingProvider replays an answer without calling the model again', async () => {
  const inner = new ScriptedProvider([{ n: 42 }]);
  const cache = new CachingProvider(inner, mkdtempSync(path.join(tmpdir(), 'ai-cache-')));
  const req = { task: 't', system: 's', text: 'q', schema: z.object({ n: z.number() }) };

  expect(await cache.structured(req)).toEqual({ n: 42 });
  expect(await cache.structured(req)).toEqual({ n: 42 });
  expect(inner.requests).toHaveLength(1);
});
