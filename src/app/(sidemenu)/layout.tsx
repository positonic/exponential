import Layout from "~/app/_components/layout/Layout";
import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-orbitron',
});
import { type Metadata } from "next";
import { TRPCReactProvider } from "~/trpc/react";
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import { ThemeProvider } from '~/providers/ThemeProvider';
import { themes } from '~/config/themes';
import { getThemeDomain } from '~/config/site';
import { Analytics } from '@vercel/analytics/next';
import { FloatingFeedbackButton } from '~/app/_components/FloatingFeedbackButton';
import { ColorSchemeScript } from '~/app/_components/layout/ColorSchemeScript';
import { MantineRootProvider } from '~/app/_components/layout/MantineRootProvider';
import { ColorSchemeProvider } from '~/app/_components/layout/ColorSchemeProvider';
import { SessionProvider } from "next-auth/react";
import { OfflineBanner } from '~/app/_components/OfflineBanner';
import { ServiceWorkerRegistration } from '~/app/_components/ServiceWorkerRegistration';

const domain = getThemeDomain();

export const metadata: Metadata = {
  title: themes[domain].branding.title,
  description: themes[domain].branding.description,
  icons: themes[domain].branding.icons,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();

  return (
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} ${orbitron.variable} h-full`}>
      <head>
        <ColorSchemeScript />
        {/* PWA Meta Tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
        {/* eslint-disable-next-line no-restricted-syntax -- theme-color meta tags require actual hex values */}
        <meta name="theme-color" content="#1a1b1e" media="(prefers-color-scheme: dark)" />
        {/* eslint-disable-next-line no-restricted-syntax -- theme-color meta tags require actual hex values */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        {/* iOS PWA Meta Tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Exponential" />
        {/* Manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="h-full bg-background-primary">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <SessionProvider>
              <MantineRootProvider>
                <ColorSchemeProvider>
                  <Layout domain={domain}>
                    {children}
                    <Analytics />
                  </Layout>
                  <FloatingFeedbackButton />
                  <OfflineBanner />
                  <ServiceWorkerRegistration />
                </ColorSchemeProvider>
              </MantineRootProvider>
            </SessionProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}