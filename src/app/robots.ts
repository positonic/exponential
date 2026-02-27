import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/blog',
          '/features/',
          '/explore',
          '/docs',
          '/privacy',
          '/terms',
          '/web3',
        ],
        disallow: [
          '/home',
          '/projects',
          '/goals',
          '/outcomes',
          '/actions',
          '/act',
          '/plan',
          '/integrations',
          '/workflows',
          '/journal',
          '/meetings',
          '/videos',
          '/settings',
          '/days',
          '/recordings',
          '/multi-agent',
          '/agent',
          '/w/',
          '/signin',
          '/api/',
          '/admin/',
          '/_next/',
        ],
      },
    ],
    sitemap: 'https://www.exponential.im/sitemap.xml',
  };
}
