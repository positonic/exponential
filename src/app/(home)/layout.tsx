import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { inter } from '~/lib/fonts';
import { type Metadata } from "next";
import { TRPCReactProvider } from "~/trpc/react";
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import { Notifications } from '@mantine/notifications';
import { ThemeProvider } from '~/providers/ThemeProvider';
import { themes } from '~/config/themes';
import { getThemeDomain } from '~/config/site';
import { mantineThemes } from '~/config/themes';
import { ModalsProvider } from '@mantine/modals';
import { Analytics } from '@vercel/analytics/next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { FloatingFeedbackButton } from '~/app/_components/FloatingFeedbackButton';
import { PRODUCT_NAME, PRODUCT_SEO_DESCRIPTION, SOCIAL_PROFILES } from '~/lib/brand';
import { getPublicBaseUrlFromEnv } from '~/lib/urls';

const domain = getThemeDomain();
const baseUrl = getPublicBaseUrlFromEnv();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: themes[domain].branding.title,
  description: themes[domain].branding.description,
  icons: themes[domain].branding.icons,
  alternates: {
    canonical: './',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: PRODUCT_NAME,
    title: themes[domain].branding.title,
    description: themes[domain].branding.description,
    url: baseUrl,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${PRODUCT_NAME} - The OS for AI-Native Organizations`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: themes[domain].branding.title,
    description: themes[domain].branding.description,
    images: ['/og-image.png'],
  },
  // Search Console HTML-tag verification. Unset means no tag (e.g. the
  // property is verified by DNS instead).
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

const organizationId = `${baseUrl}/#organization`;

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    "name": PRODUCT_NAME,
    "url": baseUrl,
    "logo": `${baseUrl}/expo-logo-1024.png`,
    "sameAs": Object.values(SOCIAL_PROFILES),
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": PRODUCT_NAME,
    "description": PRODUCT_SEO_DESCRIPTION,
    "url": baseUrl,
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser",
    "license": "https://www.gnu.org/licenses/agpl-3.0.html",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "creator": { "@id": organizationId },
    "featureList": [
      "Goals and OKRs that cascade into projects and actions",
      "AI agents and humans working on the same projects",
      "MCP server for Claude Desktop and Claude Code",
      "Command-line interface and TypeScript SDK",
      "Meeting notes that turn into actions",
      "Open source (AGPL-3.0) and self-hostable"
    ]
  },
];

export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();
  const mantineTheme = mantineThemes[domain];

  return (
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} ${inter.variable} h-full scroll-smooth`} suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${PRODUCT_NAME} Blog`}
          href="/blog/feed.xml"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="h-full w-full overflow-x-hidden">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <MantineProvider defaultColorScheme="dark" theme={mantineTheme}>
              <ModalsProvider>
                <Notifications position="top-right" />
                {children}
                <Analytics />
                {process.env.NEXT_PUBLIC_GA_ID && (
                  <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
                )}
                <FloatingFeedbackButton />
              </ModalsProvider>
            </MantineProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}