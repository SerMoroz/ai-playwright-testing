import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

/** One structured request to the model: instructions, page context, optional screenshot, and the shape of the answer. */
export interface StructuredRequest<T extends z.ZodType> {
  /** Short label used in logs and the cache file name, e.g. "act" or "heal". */
  task: string;
  system: string;
  text: string;
  imagePng?: Buffer;
  schema: T;
}

/**
 * Anything that can answer a StructuredRequest. The real implementation calls Claude;
 * tests/offline swaps in a scripted fake so the plumbing can be tested without an API key.
 */
export interface AiProvider {
  structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>>;
}

export const MODEL = process.env.AI_MODEL ?? 'claude-opus-5-5';
const EFFORT = (process.env.AI_EFFORT ?? 'low') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** True when the SDK has an env credential to use. AI tests skip themselves otherwise. */
export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class ClaudeProvider implements AiProvider {
  private client = new Anthropic();

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (req.imagePng) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: req.imagePng.toString('base64') },
      });
    }
    content.push({ type: 'text', text: req.text });

    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Server-side fallback: if a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: betaZodOutputFormat(req.schema) },
      system: req.system,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(`[ai:${req.task}] model declined the request: ${response.stop_details?.explanation ?? 'no details'}`);
    }
    if (response.parsed_output == null) {
      throw new Error(`[ai:${req.task}] model returned no parsable output (stop_reason: ${response.stop_reason})`);
    }
    return response.parsed_output as z.infer<T>;
  }
}

/**
 * Wraps a provider with a file cache keyed by the full request. Re-running a test against an
 * unchanged page replays the same answer: faster, free, and deterministic. Disable with AI_CACHE=off.
 */
export class CachingProvider implements AiProvider {
  constructor(
    private inner: AiProvider,
    private dir = path.resolve('.ai-cache'),
  ) {}

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    const hash = createHash('sha256')
      .update(MODEL)
      .update(req.system)
      .update(req.text)
      .update(req.imagePng ?? '')
      .digest('hex')
      .slice(0, 16);
    const file = path.join(this.dir, `${req.task}-${hash}.json`);

    if (existsSync(file)) {
      const cached = req.schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (cached.success) return cached.data;
    }
    const result = await this.inner.structured(req);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(file, JSON.stringify(result, null, 2));
    return result;
  }
}

let shared: AiProvider | undefined;

/** The provider the `ai` fixture uses: Claude, cached unless AI_CACHE=off. */
export function defaultProvider(): AiProvider {
  if (!shared) {
    const claude = new ClaudeProvider();
    shared = process.env.AI_CACHE === 'off' ? claude : new CachingProvider(claude);
  }
  return shared;
}
