import type { MetadataRoute } from 'next';
import { getPublicBaseUrl } from '~/lib/urls';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await getPublicBaseUrl();
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
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
