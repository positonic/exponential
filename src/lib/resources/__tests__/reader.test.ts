import { describe, it, expect } from 'vitest';
import {
  anySummaryPending,
  isSummaryPending,
  knowledgeHref,
  readerContent,
  resourceReaderHref,
  safeSourceUrl,
  sourceLinkLabel,
  SUMMARY_PENDING_MS,
} from '../reader';

const VIDEO = 'https://youtu.be/dQw4w9WgXcQ';
const ARTICLE = 'https://example.com/post';

describe('isSummaryPending', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const justSaved = new Date(now - 1_000);

  it('waits for a freshly saved video with no summary', () => {
    expect(isSummaryPending({ url: VIDEO, summary: null, createdAt: justSaved }, now)).toBe(true);
    expect(isSummaryPending({ url: VIDEO, summary: null, createdAt: justSaved.toISOString() }, now)).toBe(true);
  });

  it('stops waiting once summarised, past the window, or for anything else', () => {
    expect(isSummaryPending({ url: VIDEO, summary: 'done', createdAt: justSaved }, now)).toBe(false);
    expect(isSummaryPending({ url: VIDEO, summary: null, createdAt: new Date(now - SUMMARY_PENDING_MS) }, now)).toBe(false);
    expect(isSummaryPending({ url: ARTICLE, summary: null, createdAt: justSaved }, now)).toBe(false);
    expect(isSummaryPending({ url: null, summary: null, createdAt: justSaved }, now)).toBe(false);
  });
});

describe('anySummaryPending', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');

  it('stops polling for a video that never got a summary', () => {
    const monthsOld = { url: VIDEO, summary: null, createdAt: new Date('2026-08-01T00:00:00Z') };

    expect(anySummaryPending([monthsOld], now)).toBe(false);
    // With the real clock too: the failure was an array index standing in for `now`.
    expect(anySummaryPending([monthsOld, monthsOld])).toBe(false);
  });

  it('polls while any row is waiting', () => {
    const fresh = { url: VIDEO, summary: null, createdAt: new Date(now - 1_000) };
    const done = { url: VIDEO, summary: 'done', createdAt: new Date(now - 1_000) };

    expect(anySummaryPending([done, fresh], now)).toBe(true);
    expect(anySummaryPending([done], now)).toBe(false);
    expect(anySummaryPending([], now)).toBe(false);
  });
});

describe('reader addresses', () => {
  it('stays inside the workspace when there is one', () => {
    expect(resourceReaderHref('r1', 'acme')).toBe('/w/acme/knowledge-base/r1');
    expect(knowledgeHref('acme')).toBe('/w/acme/knowledge-base');
  });

  it('falls back to the unscoped Knowledge page', () => {
    expect(resourceReaderHref('r1')).toBe('/knowledge-base/r1');
    expect(resourceReaderHref('r1', null)).toBe('/knowledge-base/r1');
    expect(knowledgeHref(null)).toBe('/knowledge-base');
  });
});

describe('safeSourceUrl', () => {
  it('passes web addresses through unchanged', () => {
    expect(safeSourceUrl(ARTICLE)).toBe(ARTICLE);
    expect(safeSourceUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'not a url', '', null, undefined])(
    'refuses %s',
    (url) => {
      expect(safeSourceUrl(url)).toBeNull();
    },
  );
});

describe('sourceLinkLabel', () => {
  it('names YouTube and is generic otherwise', () => {
    expect(sourceLinkLabel(VIDEO)).toBe('Watch on YouTube');
    expect(sourceLinkLabel(ARTICLE)).toBe('Open original');
  });
});

describe('readerContent', () => {
  const base = { summary: null, content: null, rawContent: null, contentType: 'web_page' };

  it('leads a summarised video with the summary, its transcript behind a label', () => {
    expect(readerContent({ ...base, summary: '### Overview', content: 'words', contentType: 'video' })).toEqual({
      summary: '### Overview',
      body: 'words',
      bodyLabel: 'Transcript',
      isEmpty: false,
    });
  });

  it('reads a summary with no transcript (the Gemini path)', () => {
    const out = readerContent({ ...base, summary: '### Overview', contentType: 'video' });
    expect(out.body).toBeNull();
    expect(out.isEmpty).toBe(false);
  });

  it('reads an article with no summary, preferring Markdown over the captured HTML', () => {
    const out = readerContent({ ...base, content: 'markdown', rawContent: '<p>html</p>' });
    expect(out).toMatchObject({ summary: null, body: 'markdown', bodyLabel: 'Full article', isEmpty: false });
    expect(readerContent({ ...base, rawContent: '<p>html</p>' }).body).toBe('<p>html</p>');
  });

  it('is empty for a bare link, including whitespace-only fields', () => {
    expect(readerContent({ ...base, contentType: 'bookmark' }).isEmpty).toBe(true);
    expect(readerContent({ ...base, summary: '  ', content: '\n' }).isEmpty).toBe(true);
  });
});
