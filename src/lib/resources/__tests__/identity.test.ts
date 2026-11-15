import { describe, it, expect } from 'vitest';
import { isTrackingParam, pageIdentity, resourceAddresses, savedAddress } from '../identity';

/**
 * The contract shared with the Chrome extension, which computes the same
 * identity in the browser and mirrors these rows in its own tests
 * (`test/page-identity.test.js` in alpha-chrome-plugin). The first four are
 * the rows from ticket witty.otter; add a row here and add it there.
 */
const IDENTITY_EXAMPLES: Array<{ visited: string; declared: string | null; identity: string }> = [
  {
    visited:
      'https://www.airbnb.com/rooms/53368445?adults=4&check_in=2027-01-25&check_out=2027-01-30&source_impression_id=p3_x',
    declared: 'https://www.airbnb.com/rooms/53368445',
    identity: 'https://www.airbnb.com/rooms/53368445',
  },
  {
    visited: 'https://www.google.com/travel/flights/search?tfs=ABC&utm_source=x',
    declared: 'https://www.google.com/travel/flights',
    identity: 'https://www.google.com/travel/flights/search?tfs=ABC',
  },
  {
    visited: 'https://Example.com/Article/?utm_campaign=a&b=2&a=1#section',
    declared: null,
    identity: 'https://example.com/Article?a=1&b=2',
  },
  {
    visited: 'https://shop.example.com/item/9?ref=home',
    declared: 'https://tracker.example.net/item/9',
    identity: 'https://shop.example.com/item/9?ref=home',
  },
];

describe('pageIdentity', () => {
  it.each(IDENTITY_EXAMPLES)('$visited → $identity', ({ visited, declared, identity }) => {
    expect(pageIdentity(visited, declared)).toBe(identity);
  });

  it('gives one identity to a listing opened with different dates, guests and tracking', () => {
    const declared = 'https://www.airbnb.com/rooms/53368445';
    const january = pageIdentity(
      'https://www.airbnb.com/rooms/53368445?adults=4&check_in=2027-01-25&check_out=2027-01-30',
      declared,
    );
    const march = pageIdentity(
      'https://www.airbnb.com/rooms/53368445?adults=2&check_in=2027-03-01&check_out=2027-03-05&utm_source=mail',
      declared,
    );
    expect(march).toBe(january);
  });

  it('keeps two searches apart when the site declares one generic address for both', () => {
    const declared = 'https://www.google.com/travel/flights';
    const toLanzarote = pageIdentity('https://www.google.com/travel/flights/search?tfs=ACE', declared);
    const toMadeira = pageIdentity('https://www.google.com/travel/flights/search?tfs=FNC', declared);
    expect(toLanzarote).not.toBe(toMadeira);
  });

  it('ignores a declared URL on another host or another path', () => {
    const visited = 'https://shop.example.com/item/9?size=m';
    expect(pageIdentity(visited, 'https://other.example.com/item/9')).toBe(visited);
    expect(pageIdentity(visited, 'https://shop.example.com/item')).toBe(visited);
    expect(pageIdentity(visited, 'not a url')).toBe(visited);
    expect(pageIdentity(visited, 'javascript:alert(1)')).toBe(visited);
  });

  it('accepts a declared URL that differs only by a leading www. or a trailing slash', () => {
    expect(pageIdentity('https://example.com/post?ref=x', 'https://www.example.com/post/')).toBe(
      'https://www.example.com/post',
    );
    expect(pageIdentity('https://www.example.com/post/?ref=x', 'https://example.com/post')).toBe(
      'https://example.com/post',
    );
  });

  it('does not depend on the order parameters arrive in, and keeps repeated names in order', () => {
    expect(pageIdentity('https://example.com/s?b=2&a=1')).toBe(pageIdentity('https://example.com/s?a=1&b=2'));
    expect(pageIdentity('https://example.com/s?tag=b&x=1&tag=a')).toBe('https://example.com/s?tag=b&tag=a&x=1');
  });

  it('keeps path case, the root slash and a port, and drops empty parameters', () => {
    expect(pageIdentity('HTTPS://Example.COM:8443/Docs/Read?&a=1&')).toBe('https://example.com:8443/Docs/Read?a=1');
    expect(pageIdentity('https://example.com')).toBe('https://example.com/');
    expect(pageIdentity('https://example.com/?utm_source=x')).toBe('https://example.com/');
  });

  it('is null for anything that is not a web address', () => {
    expect(pageIdentity('chrome://extensions')).toBeNull();
    expect(pageIdentity('file:///x')).toBeNull();
    expect(pageIdentity('not a url')).toBeNull();
  });
});

describe('savedAddress', () => {
  it('removes tracking parameters and changes nothing else', () => {
    expect(
      savedAddress(
        'https://www.airbnb.com/rooms/53368445?adults=4&check_in=2027-01-25&check_out=2027-01-30&source_impression_id=p3_x',
      ),
    ).toBe('https://www.airbnb.com/rooms/53368445?adults=4&check_in=2027-01-25&check_out=2027-01-30');
    expect(savedAddress('https://Example.com/Article/?utm_campaign=a&b=2&a=1#section')).toBe(
      'https://Example.com/Article/?b=2&a=1#section',
    );
  });

  it('drops the question mark when only tracking parameters were there', () => {
    expect(savedAddress('https://example.com/post?utm_source=x&fbclid=y#top')).toBe('https://example.com/post#top');
  });

  it('returns an address with nothing to remove exactly as it came', () => {
    const url = 'https://example.com/a/?federated_search_id=9&b=&&c';
    expect(savedAddress(url)).toBe(url);
    expect(savedAddress('https://example.com/post')).toBe('https://example.com/post');
  });

  it('is null for anything that is not a web address', () => {
    expect(savedAddress('chrome://extensions')).toBeNull();
    expect(savedAddress('file:///x')).toBeNull();
    expect(savedAddress('not a url')).toBeNull();
  });
});

describe('isTrackingParam', () => {
  it('knows the denylist, in any case', () => {
    for (const name of ['utm_source', 'UTM_Campaign', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'source_impression_id']) {
      expect(isTrackingParam(name)).toBe(true);
    }
  });

  it('keeps everything else, because it may be meaningful', () => {
    for (const name of ['check_in', 'adults', 'ref', 'federated_search_id', 'utm', 'id', 'q']) {
      expect(isTrackingParam(name)).toBe(false);
    }
  });
});

describe('resourceAddresses', () => {
  it('pairs the address the link opens with the identity it is matched by', () => {
    expect(
      resourceAddresses(
        'https://www.airbnb.com/rooms/53368445?adults=4&source_impression_id=p3_x',
        'https://www.airbnb.com/rooms/53368445',
      ),
    ).toEqual({
      url: 'https://www.airbnb.com/rooms/53368445?adults=4',
      identity: 'https://www.airbnb.com/rooms/53368445',
    });
  });

  it('keeps a non-web URL as written, as its own identity', () => {
    expect(resourceAddresses('mailto:someone@example.com')).toEqual({
      url: 'mailto:someone@example.com',
      identity: 'mailto:someone@example.com',
    });
  });
});
