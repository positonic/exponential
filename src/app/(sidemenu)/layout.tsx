import Layout from "~/app/_components/layout/Layout";
import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { fontVariables } from '~/lib/fonts';
import { type Metadata } from "next";
import { TRPCReactProvider } from "~/trpc/react";
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import { ThemeProvider } from '~/providers/ThemeProvider';
import { AgentModalProvider } from '~/providers/AgentModalProvider';
import { AiCapabilitiesProvider } from '~/providers/AiCapabilitiesProvider';
import { resolveAiCapabilities } from '~/server/services/ai/capabilities';
import { BugReportProvider } from '~/providers/BugReportProvider';
import { themes } from '~/config/themes';
import { getThemeDomain } from '~/config/site';
import { Analytics } from '@vercel/analytics/next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { ZoeDrawer, ZoeFab } from '~/app/_components/layout/ZoeDrawer';
import { CommandPalette } from '~/app/_components/layout/CommandPalette';
import { ColorSchemeScript } from '@mantine/core';
import { ThemeInitScript } from '~/app/_components/layout/ThemeInitScript';
import { DesktopChromeScript } from '~/app/_components/layout/DesktopChromeScript';
import { MantineRootProvider } from '~/app/_components/layout/MantineRootProvider';
import { SessionProvider } from "next-auth/react";
import { auth } from "~/server/auth";
import { WorkspaceProvider } from '~/providers/WorkspaceProvider';
import { ActiveTimerProvider } from '~/hooks/useActiveTimer';
import { ServiceWorkerRegistration } from '~/app/_components/ServiceWorkerRegistration';
import { PRODUCT_NAME } from '~/lib/brand';
import { getPublicBaseUrlFromEnv } from '~/lib/urls';

const domain = getThemeDomain();

export const metadata: Metadata = {
  metadataBase: new URL(getPublicBaseUrlFromEnv()),
  title: themes[domain].branding.title,
  description: themes[domain].branding.description,
  icons: themes[domain].branding.icons,
  alternates: {
    canonical: './',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();
  // Hand the session to SessionProvider so the client doesn't open every page
  // with an /api/auth/session round trip before anything that reads it can
  // render. auth() is request-cached and decodes the JWT without a DB call;
  // Layout below awaits the same call. Only the fields the UI reads are
  // passed, so the raw token never lands in page HTML.
  const session = await auth();
  // Resolved per request (auth() makes this layout dynamic), so a key added
  // to a running install and a restart is enough — nothing is baked at build.
  const aiCapabilities = resolveAiCapabilities(process.env);

  return (
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} ${fontVariables} h-full`} suppressHydrationWarning>
      <head>
        {/* Migration + dark-variant first, then Mantine's scheme script reads
            the (possibly just-migrated) mantine-color-scheme-value key. */}
        <ThemeInitScript />
        <ColorSchemeScript defaultColorScheme="dark" />
        {/* Reserves the top-left corner for the desktop shells' window controls. */}
        <DesktopChromeScript />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={PRODUCT_NAME} />
      </head>
      <body className="h-full bg-background-primary">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <SessionProvider session={session ? { user: session.user, expires: session.expires } : null}>
              <MantineRootProvider>
                <AiCapabilitiesProvider capabilities={aiCapabilities}>
                <AgentModalProvider>
                  <BugReportProvider>
                    <WorkspaceProvider>
                      <ActiveTimerProvider>
                        <Layout domain={domain}>
                          {children}
                          <Analytics />
                          {process.env.NEXT_PUBLIC_GA_ID && (
                            <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
                          )}
                        </Layout>
                        <ServiceWorkerRegistration />
                        <ZoeDrawer />
                        <ZoeFab />
                        <CommandPalette />
                      </ActiveTimerProvider>
                    </WorkspaceProvider>
                  </BugReportProvider>
                </AgentModalProvider>
                </AiCapabilitiesProvider>
              </MantineRootProvider>
            </SessionProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}