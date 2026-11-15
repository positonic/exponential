import { describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({ default: {} }));
vi.mock('~/env', () => ({ env: {} }));

const { shouldRecord } = await import('../SessionReplay');

describe('shouldRecord', () => {
  it.each(['/onboarding', '/welcome', '/welcome/menu', '/w/exponential', '/w/exponential/projects/abc'])(
    'records %s',
    (path) => {
      expect(shouldRecord(path)).toBe(true);
    },
  );

  it.each(['/', '/home', '/w/clear', '/w/clear/products', '/w/exponential-labs', '/welcome-back', '/docs'])(
    'does not record %s',
    (path) => {
      expect(shouldRecord(path)).toBe(false);
    },
  );
});

const { maskAttribute } = await import('../SessionReplay');

describe('maskAttribute', () => {
  it.each([
    ['title', 'Q4 board deck'],
    ['aria-label', 'Remove Q4 board deck from favourites'],
    ['alt', 'Photo of Andi'],
    ['placeholder', 'Search CLEAR tickets'],
    ['href', '/w/exponential/projects/mvp_development-cmlf3zmw4'],
    ['id', 'getting-started'],
    ['value', 'secret'],
    ['data-title', 'Board deck 2026'],
    ['data-unknown-thing', 'Andi Smith'],
  ])('masks %s', (name, value) => {
    expect(maskAttribute(name, value, document.createElement('a'))).toBe('***');
  });

  it.each([
    ['class', 'flex gap-2 rounded-md'],
    ['viewBox', '0 0 24 24'],
    ['d', 'M5 12h14'],
    ['aria-expanded', 'true'],
    ['data-variant', 'filled'],
    ['data-active', ''],
    ['_cssText', '.a{color:red}'],
  ])('keeps the rendering attribute %s', (name, value) => {
    expect(maskAttribute(name, value, document.createElement('div'))).toBe(value);
  });

  it('keeps stylesheet links but masks other links', () => {
    const css = '/_next/static/css/app.css';
    expect(maskAttribute('href', css, document.createElement('link'))).toBe(css);
    expect(maskAttribute('href', css, document.createElement('a'))).toBe('***');
  });

  it('strips image URLs from inline styles and keeps the layout', () => {
    expect(maskAttribute('style', 'width: 40px; background-image: url("https://cdn.example/andi.jpg")'))
      .toBe('width: 40px; background-image: url()');
  });
});
