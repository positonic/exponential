import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { ThemeProvider } from "~/providers/ThemeProvider";
import { mantineThemes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";

/**
 * Bare shell for public, unauthenticated pages (the Forms renderer at /f/[slug]).
 * Provides the theme + Mantine but no sidemenu, no auth, no tRPC.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();
  const mantineTheme = mantineThemes[domain];

  return (
    <html
      lang="en"
      data-mantine-color-scheme="dark"
      className={`${GeistSans.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="h-full w-full overflow-x-hidden bg-background-primary">
        <ThemeProvider domain={domain}>
          <MantineProvider defaultColorScheme="dark" theme={mantineTheme}>
            {children}
          </MantineProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}