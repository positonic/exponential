import { describe, expect, it } from 'vitest';
import { classifyQuickSave, titleFromText } from '../quickSave';

describe('classifyQuickSave', () => {
  it('returns null for blank input', () => {
    expect(classifyQuickSave('   \n ')).toBeNull();
  });

  it('keeps a pasted http(s) URL as typed', () => {
    expect(classifyQuickSave('  https://example.com/post?a=1 ')).toEqual({
      kind: 'link',
      url: 'https://example.com/post?a=1',
    });
  });

  it('reads a bare domain as an https link', () => {
    expect(classifyQuickSave('example.com/post')).toEqual({
      kind: 'link',
      url: 'https://example.com/post',
    });
  });

  it('saves a one-word value as a note, not a link', () => {
    expect(classifyQuickSave('hello')).toEqual({ kind: 'note', title: 'hello', content: 'hello' });
  });

  it('saves a non-http scheme as a note', () => {
    expect(classifyQuickSave('javascript:alert(1)')?.kind).toBe('note');
  });

  it('saves a sentence containing a URL as a note', () => {
    const text = 'Read this later https://example.com';
    expect(classifyQuickSave(text)).toEqual({ kind: 'note', title: text, content: text });
  });

  it('keeps the full markdown body and titles it from the first line', () => {
    const md = '\n# Meeting **prep**\n\n- one\n- two\n';
    expect(classifyQuickSave(md)).toEqual({
      kind: 'note',
      title: 'Meeting prep',
      content: '# Meeting **prep**\n\n- one\n- two',
    });
  });
});

describe('titleFromText', () => {
  it('strips list, quote and checkbox markers', () => {
    expect(titleFromText('- [ ] ship it')).toBe('ship it');
    expect(titleFromText('> quoted')).toBe('quoted');
    expect(titleFromText('1. first')).toBe('first');
  });

  it('keeps link text and drops the target', () => {
    expect(titleFromText('See [the docs](https://example.com) now')).toBe('See the docs now');
  });

  it('truncates long lines at a word boundary', () => {
    const title = titleFromText('word '.repeat(40));
    expect(title.length).toBeLessThanOrEqual(81);
    expect(title.endsWith('word…')).toBe(true);
  });

  it('falls back when the first line is only markup', () => {
    expect(titleFromText('#   ')).toBe('Untitled note');
  });
});
