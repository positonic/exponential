import Layout from "~/app/_components/layout/Layout";
import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
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
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} ${orbitron.className} h-full`}>
      <head>
        <ColorSchemeScript />
      </head>
      <body className="h-full bg-background-primary">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <MantineRootProvider>
              <ColorSchemeProvider>
                <Layout domain={domain}>
                  {children}
                  <Analytics />
                </Layout>
                <FloatingFeedbackButton />
              </ColorSchemeProvider>
            </MantineRootProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}