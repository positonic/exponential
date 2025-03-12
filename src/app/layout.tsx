import Layout from "~/app/_components/layout/Layout";
import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { TRPCReactProvider } from "~/trpc/react";
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import { ThemeProvider } from '~/providers/ThemeProvider';
import { themes, type ValidDomain } from '~/config/themes';
import { getThemeDomain } from '~/config/site';
import { mantineThemes } from '~/config/themes';


export const metadata: Metadata = {
  title: 'Force Flow | Maybe the flow be with you',
  description: 'Transform your productivity with Force Flow - an AI-powered personal management system that helps you organize tasks, track projects, and make better decisions. Features smart project management, semantic search, and intelligent insights.',
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();
  const mantineTheme = mantineThemes[domain];

  return (
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} h-full`}>
      <body className={`h-full ${themes[domain].colors.background.main}`}>
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <MantineProvider defaultColorScheme="dark" theme={mantineTheme}>
              <Notifications position="top-right" />
              <Layout>
                {children}
              </Layout>
            </MantineProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}