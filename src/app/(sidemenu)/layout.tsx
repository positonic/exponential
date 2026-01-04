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
import { AgentDrawerProvider } from '~/providers/AgentDrawerProvider';
import { themes } from '~/config/themes';
import { getThemeDomain } from '~/config/site';
import { Analytics } from '@vercel/analytics/next';
import { FloatingFeedbackButton } from '~/app/_components/FloatingFeedbackButton';
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
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} ${orbitron.variable} h-full`}>
      <head>
        <ColorSchemeScript />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
      </head>
      <body className="h-full bg-background-primary">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <SessionProvider>
              <MantineRootProvider>
                <AgentDrawerProvider>
                  <ColorSchemeProvider>
                    <WorkspaceProvider>
                      <Layout domain={domain}>
                        {children}
                        <Analytics />
                      </Layout>
                      <FloatingFeedbackButton />
                    </WorkspaceProvider>
                  </ColorSchemeProvider>
                </AgentDrawerProvider>
              </MantineRootProvider>
            </SessionProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}