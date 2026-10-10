import type { MetadataRoute } from 'next';
import { getAllBlogPosts } from '~/lib/blog/getBlogPost';
import { getAllFeatureSlugs } from '~/app/(home)/features/_data/features';
import { getAllIntegrationSlugs } from '~/app/(home)/features/integrations/_data/integrations';
import { getAllLearnArticles } from '~/lib/learn/getLearnArticle';
import { getAllDocSlugs } from '~/lib/docs/getDoc';
import { getPublicBaseUrl } from '~/lib/urls';
import { buildPublicPagePath } from '~/lib/pages/public-url';
import { db } from '~/server/db';

// Regenerate hourly so post-deploy publish/SEO-opt-in changes reach the
// sitemap without a rebuild.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await getPublicBaseUrl();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/product-timeline`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];

  // Blog posts with actual dates
  const blogPosts = await getAllBlogPosts();
  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.meta.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Feature pages
  const featureSlugs = getAllFeatureSlugs();
  const featurePages: MetadataRoute.Sitemap = featureSlugs.map((slug) => ({
    url: `${baseUrl}/features/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Learn articles
  const learnArticles = await getAllLearnArticles();
  const learnPages: MetadataRoute.Sitemap = learnArticles.map((article) => ({
    url: `${baseUrl}/learn/${article.slug}`,
    lastModified: new Date(article.meta.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Integration pages
  const integrationPages: MetadataRoute.Sitemap = getAllIntegrationSlugs().map((slug) => ({
    url: `${baseUrl}/features/integrations/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Doc pages
  const docSlugs = await getAllDocSlugs();
  const docPages: MetadataRoute.Sitemap = docSlugs.map((slugParts) => ({
    url: `${baseUrl}/docs/${slugParts.join('/')}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  // Published pages that opted into search indexing (ADR-0038). noindex
  // (default) pages are deliberately absent — public means link-only there.
  // The sitemap is also generated at build time, so a DB that is unreachable
  // or not yet migrated must degrade to "no page entries", never fail the
  // build.
  let publicPagePaths: MetadataRoute.Sitemap = [];
  try {
    const publishedPages = await db.knowledgePage.findMany({
      where: { isPublic: true, publicSeoIndexed: true, publicId: { not: null } },
      select: { publicId: true, publicSlug: true, updatedAt: true },
    });
    publicPagePaths = publishedPages.map((page) => ({
      url: `${baseUrl}${buildPublicPagePath(page.publicSlug ?? 'untitled', page.publicId!)}`,
      lastModified: page.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch (error) {
    console.warn('[sitemap] Skipping published pages:', error);
  }

  return [
    ...staticPages,
    ...blogPages,
    ...learnPages,
    ...featurePages,
    ...integrationPages,
    ...docPages,
    ...publicPagePaths,
  ];
}
