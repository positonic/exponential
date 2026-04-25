import { describe, it, expect } from 'vitest';
import { compactUrls, stripHtml } from '../utils';

describe('compactUrls', () => {
  it('returns empty string for empty input', () => {
    expect(compactUrls('')).toBe('');
  });

  it('returns text unchanged when no URLs present', () => {
    expect(compactUrls('Buy groceries')).toBe('Buy groceries');
  });

  it('compacts <a> tags where anchor text is a URL', () => {
    const input =
      'Review doc <a href="https://notion.so/abc">https://notion.so/abc</a>';
    const result = compactUrls(input);
    expect(result).toContain('Review doc');
    expect(result).toContain('[link]');
    expect(result).toContain('href="https://notion.so/abc"');
    // The raw URL text should be gone
    expect(result).not.toContain('>https://notion.so/abc</a>');
  });

  it('preserves <a> tags with non-URL display text', () => {
    const input = 'Check <a href="https://example.com">the docs</a>';
    const result = compactUrls(input);
    expect(result).toContain('>the docs</a>');
    expect(result).not.toContain('[link]');
  });

  it('compacts raw plain-text URLs', () => {
    const input =
      'Post about https://www.exponential.im/blog/the-self-steering-method';
    const result = compactUrls(input);
    expect(result).toContain('Post about');
    expect(result).toContain('[link]');
    // The raw URL should not appear as visible text, only inside the href attribute
    expect(result).not.toContain(
      '>https://www.exponential.im/blog/the-self-steering-method<',
    );
    // URL should be preserved in the href for navigation
    expect(result).toContain(
      'href="https://www.exponential.im/blog/the-self-steering-method"',
    );
  });

  it('handles multiple URLs', () => {
    const input =
      'Links <a href="https://a.com">https://a.com</a> and https://b.com';
    const result = compactUrls(input);
    const linkCount = (result.match(/\[link\]/g) ?? []).length;
    expect(linkCount).toBe(2);
  });

  it('does not extract URLs from href attributes when anchor text is not a URL', () => {
    const input = '<a href="https://example.com">some text</a>';
    const result = compactUrls(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('>some text</a>');
    expect(result).not.toContain('[link]');
  });

  it('appends [link] at the end, not inline', () => {
    const input = 'Before https://example.com after';
    const result = compactUrls(input);
    // [link] anchor should be at the end (wrapped in an <a> tag)
    expect(result).toMatch(/Before after.*\[link\]<\/a>$/);
    // The URL should be removed from inline text but preserved in href
    expect(result).toContain('href="https://example.com"');
  });

  it('handles mixed HTML links and raw URLs', () => {
    const input =
      'Task <a href="https://notion.so/page">https://notion.so/page</a> also see https://docs.google.com/doc';
    const result = compactUrls(input);
    expect(result).toContain('Task');
    expect(result).toContain('also see');
    const linkCount = (result.match(/\[link\]/g) ?? []).length;
    expect(linkCount).toBe(2);
  });

  it('preserves HTML formatting tags', () => {
    const input =
      '<strong>Important</strong> task https://example.com';
    const result = compactUrls(input);
    expect(result).toContain('<strong>Important</strong>');
    expect(result).toContain('[link]');
  });
});

describe('stripHtml', () => {
  it('strips HTML tags', () => {
    expect(stripHtml('<b>bold</b> text')).toBe('bold text');
  });

  it('handles null/undefined', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});
