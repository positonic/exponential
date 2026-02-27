import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
});
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

const domain = getThemeDomain();

export const metadata: Metadata = {
  metadataBase: new URL('https://www.exponential.im'),
  title: themes[domain].branding.title,
  description: themes[domain].branding.description,
  icons: themes[domain].branding.icons,
  alternates: {
    canonical: './',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Exponential',
    title: themes[domain].branding.title,
    description: themes[domain].branding.description,
    url: 'https://www.exponential.im',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Exponential - The OS for AI-Native Organizations',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: themes[domain].branding.title,
    description: themes[domain].branding.description,
    images: ['/og-image.png'],
  },
};

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
          title="Exponential Blog"
          href="/blog/feed.xml"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Exponential",
              "description": "The coordination layer for AI-first organizations. Goals cascade into outcomes, AI handles execution, and your team stays aligned.",
              "url": "https://exponential.im",
              "applicationCategory": "ProductivityApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "Exponential",
                "url": "https://exponential.im"
              },
              "featureList": [
                "AI-native organization coordination",
                "Goals to outcomes to actions framework",
                "AI-powered execution layer",
                "Human-AI collaboration workspace",
                "Team alignment without status meetings"
              ]
            })
          }}
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