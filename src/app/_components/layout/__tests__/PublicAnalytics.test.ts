import { describe, expect, it } from 'vitest';
import { dropSignedInPageViews } from '../PublicAnalytics';

const pageView = (path: string) => ({ type: 'pageview' as const, url: `https://www.exponential.im${path}` });

describe('dropSignedInPageViews', () => {
  it.each(['/docs', '/docs/getting-started', '/privacy', '/features/goals', '/p/some-page-abc'])(
    'keeps the public page %s',
    (path) => {
      expect(dropSignedInPageViews(pageView(path))).toEqual(pageView(path));
    },
  );

  it.each(['/home', '/w/clear/products/clear/tickets', '/features', '/settings'])(
    'drops the signed-in page %s',
    (path) => {
      expect(dropSignedInPageViews(pageView(path))).toBeNull();
    },
  );

  it('ignores the query string', () => {
    expect(dropSignedInPageViews(pageView('/docs?utm_source=x'))).not.toBeNull();
    expect(dropSignedInPageViews(pageView('/home?utm_source=x'))).toBeNull();
  });
});
