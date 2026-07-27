import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDraft, loadDraft, saveDraft } from '../formDraft';

const SLUG = 'data_engineer';
const KEY = `expo:form-draft:${SLUG}`;

describe('formDraft', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips saved answers', () => {
    saveDraft(SLUG, { name: 'Ada', email: 'ada@example.com' });
    expect(loadDraft(SLUG)).toEqual({ name: 'Ada', email: 'ada@example.com' });
  });

  it('returns null when there is no draft', () => {
    expect(loadDraft(SLUG)).toBeNull();
  });

  it('does not persist empty answers, and clears any existing draft', () => {
    saveDraft(SLUG, { name: 'Ada' });
    saveDraft(SLUG, { name: '', agree: false });
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(loadDraft(SLUG)).toBeNull();
  });

  it('ignores and clears a draft older than the 7-day TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveDraft(SLUG, { name: 'Ada' });

    // 8 days later — past the TTL.
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z'));
    expect(loadDraft(SLUG)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('restores a draft still within the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveDraft(SLUG, { name: 'Ada' });

    vi.setSystemTime(new Date('2026-01-06T00:00:00Z')); // 5 days later
    expect(loadDraft(SLUG)).toEqual({ name: 'Ada' });
  });

  it('clears a draft on demand', () => {
    saveDraft(SLUG, { name: 'Ada' });
    clearDraft(SLUG);
    expect(loadDraft(SLUG)).toBeNull();
  });

  it('discards a malformed entry', () => {
    window.localStorage.setItem(KEY, 'not json');
    expect(loadDraft(SLUG)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
