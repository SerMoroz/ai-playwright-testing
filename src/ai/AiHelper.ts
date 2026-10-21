import type { Locator, Page, TestInfo } from '@playwright/test';
import { z } from 'zod';
import type { AiProvider } from './provider';
import { byAiId, formatElements, snapshotElements, stableSelector } from './snapshot';

const ActStep = z.object({
  done: z.boolean().describe('True when the instruction is fully completed and no more actions are needed.'),
  reasoning: z.string().describe('One short sentence on why this step.'),
  action: z.enum(['click', 'fill', 'select', 'press', 'none']),
  elementId: z.number().int().describe('Id from the element list, or -1 when action is "none".'),
  value: z.string().describe('Text to type, option to select, or key to press. Empty string otherwise.'),
});

const Verdict = z.object({
  pass: z.boolean(),
  reasoning: z.string().describe('What on the page supports the verdict, in one or two sentences.'),
});

const Pick = z.object({
  elementId: z.number().int().describe('Id of the matching element, or -1 if none matches.'),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
});

export interface HealEvent {
  description: string;
  brokenSelector: string;
  suggestedSelector: string;
  confidence: string;
  reasoning: string;
}

/**
 * The `ai` fixture. Every method sends the model a fresh view of the page and gets back a
 * schema-validated answer, so tests never parse free text.
 */
export class AiHelper {
  readonly heals: HealEvent[] = [];

  constructor(
    private page: Page,
    private provider: AiProvider,
    private testInfo?: TestInfo,
    private maxSteps = 8,
  ) {}

  /**
   * Performs a plain-English instruction, one action at a time: snapshot, ask for the next
   * action, run it, repeat until the model says it is done. Failed actions are fed back so
   * the model can correct itself.
   */
  async act(instruction: string): Promise<void> {
    const history: string[] = [];
    for (let step = 0; step < this.maxSteps; step++) {
      const elements = await snapshotElements(this.page);
      const decision = await this.provider.structured({
        task: 'act',
        system:
          'You drive a web browser for an automated test. Given an instruction, the steps already taken, ' +
          'and the list of interactive elements on the current page, choose the single next action. ' +
          'Only use element ids from the list. Set done=true with action "none" once the instruction is complete.',
        text: [
          `Instruction: ${instruction}`,
          `URL: ${this.page.url()}`,
          `Steps taken so far:\n${history.join('\n') || '(none)'}`,
          `Elements:\n${formatElements(elements)}`,
        ].join('\n\n'),
        schema: ActStep,
      });

      if (decision.done || decision.action === 'none') {
        this.log(`act: done after ${step} step(s) - ${decision.reasoning}`);
        return;
      }

      const target = byAiId(this.page, decision.elementId);
      const label = `${decision.action} [${decision.elementId}]${decision.value ? ` "${decision.value}"` : ''}`;
      try {
        switch (decision.action) {
          case 'click':
            await target.click({ timeout: 5000 });
            break;
          case 'fill':
            await target.fill(decision.value, { timeout: 5000 });
            break;
          case 'select':
            await target.selectOption({ label: decision.value }, { timeout: 5000 });
            break;
          case 'press':
            await target.press(decision.value, { timeout: 5000 });
            break;
        }
        await this.page.waitForLoadState('domcontentloaded');
        history.push(`${step + 1}. ${label} - ok (${decision.reasoning})`);
      } catch (err) {
        history.push(`${step + 1}. ${label} - FAILED: ${(err as Error).message.split('\n')[0]}`);
      }
      this.log(`act: ${history[history.length - 1]}`);
    }
    throw new Error(`ai.act gave up after ${this.maxSteps} steps: "${instruction}"\n${history.join('\n')}`);
  }

  /**
   * Asks the model whether a statement is true of the current page, using both a screenshot
   * and the page's accessibility tree. Use for checks that are hard to express as selectors:
   * layout, images, tone of copy, "looks like an error".
   */
  async check(statement: string): Promise<z.infer<typeof Verdict>> {
    const [screenshot, aria] = await Promise.all([
      this.page.screenshot({ fullPage: true }),
      this.page.locator('body').ariaSnapshot(),
    ]);
    const verdict = await this.provider.structured({
      task: 'check',
      system:
        'You are a strict QA reviewer. Decide whether the statement is true of the web page shown in the ' +
        'screenshot and accessibility tree. If the evidence is missing or ambiguous, the statement is false.',
      text: `Statement: ${statement}\n\nURL: ${this.page.url()}\n\nAccessibility tree:\n${aria}`,
      imagePng: screenshot,
      schema: Verdict,
    });
    this.log(`check: ${verdict.pass ? 'PASS' : 'FAIL'} "${statement}" - ${verdict.reasoning}`);
    await this.testInfo?.attach(`ai-check: ${statement}`, { body: screenshot, contentType: 'image/png' });
    return verdict;
  }

  /** Like check(), but throws with the model's reasoning when the statement is false. */
  async assert(statement: string): Promise<void> {
    const verdict = await this.check(statement);
    if (!verdict.pass) throw new Error(`AI assertion failed: "${statement}"\nReason: ${verdict.reasoning}`);
  }

  /** Pulls structured data out of the page into the given zod schema. */
  async extract<T extends z.ZodType>(what: string, schema: T): Promise<z.infer<T>> {
    const aria = await this.page.locator('body').ariaSnapshot();
    return this.provider.structured({
      task: 'extract',
      system: 'Extract exactly the requested data from the web page. Copy values as shown on the page.',
      text: `Extract: ${what}\n\nURL: ${this.page.url()}\n\nAccessibility tree:\n${aria}`,
      schema,
    });
  }

  /**
   * Self-healing locator. Tries the selector first; if it matches nothing, asks the model which
   * element fits the description, returns a locator for it, and records a HealEvent with a
   * durable replacement selector so the test can be fixed.
   */
  async locator(selector: string, description: string): Promise<Locator> {
    const primary = this.page.locator(selector);
    try {
      await primary.first().waitFor({ state: 'attached', timeout: 2000 });
      return primary;
    } catch {
      // fall through to healing
    }

    const elements = await snapshotElements(this.page);
    const pick = await this.provider.structured({
      task: 'heal',
      system:
        'A test selector no longer matches anything. From the element list, pick the one element the test ' +
        'author meant, using the description and the old selector as hints. Answer -1 if nothing fits.',
      text: `Description: ${description}\nBroken selector: ${selector}\n\nElements:\n${formatElements(elements)}`,
      schema: Pick,
    });

    const el = elements.find((e) => e.id === pick.elementId);
    if (!el) throw new Error(`Self-healing failed for "${description}" (${selector}): ${pick.reasoning}`);

    const suggested = stableSelector(el) ?? `[data-ai-id="${el.id}"]`;
    const event: HealEvent = {
      description,
      brokenSelector: selector,
      suggestedSelector: suggested,
      confidence: pick.confidence,
      reasoning: pick.reasoning,
    };
    this.heals.push(event);
    this.testInfo?.annotations.push({
      type: 'self-healed',
      description: `${selector} -> ${suggested} (${pick.confidence}): ${pick.reasoning}`,
    });
    this.log(`heal: ${selector} -> ${suggested} (${pick.confidence})`);

    return stableSelector(el) ? this.page.locator(suggested) : byAiId(this.page, el.id);
  }

  private log(message: string) {
    if (process.env.AI_DEBUG) console.log(`[ai] ${message}`);
  }
}
