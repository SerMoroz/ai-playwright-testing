import type { z } from 'zod';
import type { AiProvider, StructuredRequest } from '../../src/ai/provider';

/** Fake model: returns queued answers in order and records every request it received. */
export class ScriptedProvider implements AiProvider {
  readonly requests: StructuredRequest<z.ZodType>[] = [];

  constructor(private answers: unknown[]) {}

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    this.requests.push(req);
    if (!this.answers.length) throw new Error(`ScriptedProvider ran out of answers (task: ${req.task})`);
    // Validate like the real SDK would, so a bad script fails loudly.
    return req.schema.parse(this.answers.shift());
  }
}

export const LOGIN_HTML = `
<form id="f" onsubmit="event.preventDefault(); document.body.innerHTML = '<h1>Welcome, ' + document.querySelector('[data-test=username]').value + '</h1>'">
  <input data-test="username" placeholder="Username">
  <input data-test="password" type="password" placeholder="Password">
  <button data-test="login-button" type="submit">Login</button>
</form>`;
