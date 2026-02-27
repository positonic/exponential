import { getAllBlogPosts } from '~/lib/blog/getBlogPost';

export async function GET() {
  const posts = await getAllBlogPosts();
  const baseUrl = 'https://www.exponential.im';

  const rssItems = posts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.meta.title}]]></title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
      <description><![CDATA[${post.meta.description ?? ''}]]></description>
      <pubDate>${new Date(post.meta.date).toUTCString()}</pubDate>
      ${post.meta.author ? `<dc:creator><![CDATA[${post.meta.author}]]></dc:creator>` : ''}
      ${(post.meta.tags ?? []).map((tag) => `<category>${tag}</category>`).join('\n      ')}
    </item>`
    )
    .join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Exponential Blog</title>
    <link>${baseUrl}/blog</link>
    <description>Insights on productivity, AI-powered project management, and building AI-native organizations.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
