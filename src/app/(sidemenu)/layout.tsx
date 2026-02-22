import Layout from "~/app/_components/layout/Layout";
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
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import { ThemeProvider } from '~/providers/ThemeProvider';
import { AgentModalProvider } from '~/providers/AgentModalProvider';
import { themes } from '~/config/themes';
import { getThemeDomain } from '~/config/site';
import { Analytics } from '@vercel/analytics/next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { FloatingChatButton } from '~/app/_components/FloatingChatButton';
import { ColorSchemeScript } from '~/app/_components/layout/ColorSchemeScript';
import { MantineRootProvider } from '~/app/_components/layout/MantineRootProvider';
import { ColorSchemeProvider } from '~/app/_components/layout/ColorSchemeProvider';
import { SessionProvider } from "next-auth/react";
import { WorkspaceProvider } from '~/providers/WorkspaceProvider';

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
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} ${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
      </head>
      <body className="h-full bg-background-primary">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <SessionProvider>
              <MantineRootProvider>
                <AgentModalProvider>
                  <ColorSchemeProvider>
                    <WorkspaceProvider>
                      <Layout domain={domain}>
                        {children}
                        <Analytics />
                        {process.env.NEXT_PUBLIC_GA_ID && (
                          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
                        )}
                      </Layout>
                      <FloatingChatButton />
                    </WorkspaceProvider>
                  </ColorSchemeProvider>
                </AgentModalProvider>
              </MantineRootProvider>
            </SessionProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}