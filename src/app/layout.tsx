import Layout from "~/app/_components/layout/Layout";
import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';

const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: 6,
  colors: {
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#25262B',
      '#262626',
      '#141517',
      '#101113',
    ],
  },
});

export const metadata: Metadata = {
  title: 'Force Flow | Maybe the flow be with you',
  description: 'Transform your productivity with Force Flow - an AI-powered personal management system that helps you organize tasks, track projects, and make better decisions. Features smart project management, semantic search, and intelligent insights.',
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-mantine-color-scheme="dark" className={`${GeistSans.variable} h-full`}>
      <body className="h-full bg-gradient-to-b from-[#111111] to-[#212121] ">
        <TRPCReactProvider>
          <MantineProvider theme={theme}>
            <Layout>
              {children}
            </Layout>
          </MantineProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
