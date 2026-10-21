import type { Locator, Page } from '@playwright/test';

/** One visible, interactive element as the model sees it. */
export interface ElementInfo {
  id: number;
  tag: string;
  role: string;
  text: string;
  attrs: Record<string, string>;
  /** Text of the nearest ancestor that adds meaning, e.g. the product card around an "Add to cart" button. */
  context: string;
}

const ID_ATTR = 'data-ai-id';

/**
 * Lists the page's visible interactive elements and tags each with a numeric data-ai-id.
 * The model answers with an id instead of inventing a selector, so every action it picks
 * maps to an element that actually exists.
 */
export async function snapshotElements(page: Page): Promise<ElementInfo[]> {
  return page.evaluate((idAttr) => {
    const selector =
      'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="tab"], [onclick]';
    const keep = ['id', 'name', 'type', 'placeholder', 'aria-label', 'data-test', 'data-testid', 'href', 'value'];
    const clean = (s: string | null | undefined, max = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

    document.querySelectorAll(`[${idAttr}]`).forEach((el) => el.removeAttribute(idAttr));

    const out: ElementInfo[] = [];
    let next = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;

      const id = next++;
      el.setAttribute(idAttr, String(id));

      const attrs: Record<string, string> = {};
      for (const name of keep) {
        const v = name === 'value' ? (el as HTMLInputElement).value : el.getAttribute(name);
        if (v) attrs[name] = clean(v, 60);
      }

      const ownText = clean(el.innerText);
      let context = '';
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const t = clean(p.innerText, 120);
        if (t.length > ownText.length + 10) {
          context = t;
          break;
        }
      }

      out.push({
        id,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') ?? '',
        text: ownText,
        attrs,
        context,
      });
    }
    return out;
  }, ID_ATTR);
}

/** Compact, line-per-element rendering of a snapshot for the prompt. */
export function formatElements(elements: ElementInfo[]): string {
  return elements
    .map((e) => {
      const attrs = Object.entries(e.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      const ctx = e.context ? ` | in: "${e.context}"` : '';
      return `[${e.id}] <${e.tag}${e.role ? ` role=${e.role}` : ''} ${attrs}> "${e.text}"${ctx}`;
    })
    .join('\n');
}

/** Locator for an element tagged by the last snapshot. */
export function byAiId(page: Page, id: number): Locator {
  return page.locator(`[${ID_ATTR}="${id}"]`);
}

/**
 * The most durable selector we can derive for a tagged element, so a healed locator
 * can be copied back into the test code. Prefers test ids, then ids, then name.
 */
export function stableSelector(el: ElementInfo): string | undefined {
  if (el.attrs['data-test']) return `[data-test="${el.attrs['data-test']}"]`;
  if (el.attrs['data-testid']) return `[data-testid="${el.attrs['data-testid']}"]`;
  if (el.attrs.id) return `[id="${el.attrs.id}"]`;
  if (el.attrs.name) return `${el.tag}[name="${el.attrs.name}"]`;
  return undefined;
}
