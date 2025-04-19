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
import { ModalsProvider } from '@mantine/modals';
import { Analytics } from '@vercel/analytics/next';

const domain = getThemeDomain();

export const metadata: Metadata = {
  title: themes[domain].branding.title,
  description: themes[domain].branding.description,
  icons: themes[domain].branding.icons,
};

export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();
  const mantineTheme = mantineThemes[domain];

  return (
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} h-full scroll-smooth`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400..900&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full w-full overflow-x-hidden">
        <ThemeProvider domain={domain}>
          <TRPCReactProvider>
            <MantineProvider defaultColorScheme="dark" theme={mantineTheme}>
              <ModalsProvider>
                <Notifications position="top-right" />
                {children}
                <Analytics />
              </ModalsProvider>
            </MantineProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}