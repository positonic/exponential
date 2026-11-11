/**
 * A reader body can be HTML captured from any saved web page. happy-dom can't
 * run DOMPurify (it reports itself supported, then strips nothing), so this
 * pins the wiring: HTML must reach the page only as the sanitiser's output,
 * under an allowlist with nothing executable in it. The sanitiser itself was
 * checked against hostile rows in real Chromium; see PR #1016.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '~/test/test-utils';

const { sanitize } = vi.hoisted(() => ({ sanitize: vi.fn() }));
vi.mock('dompurify', () => ({ default: { sanitize, addHook: vi.fn() } }));

import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { readerContent } from '../reader';

const base = {
  summary: null,
  content: null,
  rawContent: null,
  description: null,
  contentType: 'web_page',
  mimeType: null,
};

function renderBody(fields: Partial<Record<keyof typeof base, string | null>>) {
  const { body, bodyFormat } = readerContent({ ...base, ...fields });
  return render(<MarkdownRenderer content={body ?? ''} variant="prose" format={bodyFormat} />).container;
}

describe('reader body safety', () => {
  beforeEach(() => {
    sanitize.mockReset();
    sanitize.mockReturnValue('<p>sanitised output</p>');
  });

  test('captured article HTML reaches the page only as the sanitiser output', () => {
    const hostile = '<p onclick="steal()">Kept</p><script>steal()</script>';

    const container = renderBody({ rawContent: hostile });

    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(sanitize.mock.calls[0]![0]).toBe(hostile);
    expect(container.textContent).toContain('sanitised output');
    expect(container.innerHTML).not.toContain('steal');
  });

  test('the sanitiser runs with an allowlist that has nothing executable in it', () => {
    renderBody({ rawContent: '<p>Kept</p>' });

    const options = sanitize.mock.calls[0]![1] as {
      ALLOWED_TAGS: string[];
      ALLOWED_ATTR: string[];
      ALLOW_DATA_ATTR: boolean;
    };
    for (const tag of ['script', 'iframe', 'object', 'embed', 'form', 'style', 'svg']) {
      expect(options.ALLOWED_TAGS).not.toContain(tag);
    }
    expect(options.ALLOWED_ATTR.filter((attr) => attr.startsWith('on'))).toEqual([]);
    expect(options.ALLOWED_ATTR).not.toContain('style');
    expect(options.ALLOW_DATA_ATTR).toBe(false);
  });

  test('a script with no recognised HTML tag beside it goes through react-markdown and is not run', () => {
    const container = renderBody({ rawContent: '<script>steal()</script>Plain words' });

    expect(sanitize).not.toHaveBeenCalled();
    expect(container.querySelector('script')).toBeNull();
  });

  test('a note saved as Markdown shows a literal tag as text, not as an element', () => {
    const container = renderBody({
      content: 'Use `<div>` and <img src=x onerror=steal()>',
      contentType: 'note',
      mimeType: 'text/markdown',
    });

    expect(sanitize).not.toHaveBeenCalled();
    expect(container.querySelector('code')?.textContent).toBe('<div>');
    expect(container.querySelector('img')).toBeNull();
  });
});
