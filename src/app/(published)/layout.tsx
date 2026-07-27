import "~/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { ThemeProvider } from "~/providers/ThemeProvider";
import { mantineThemes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";

/**
 * Bare shell for Published pages (`/p/[slugId]`, ADR-0038) — no sidemenu, no
 * auth, no tRPC. A separate root layout from the Forms `(public)` group on
 * purpose: published documents follow the visitor's system color scheme
 * (with a visible toggle), while the Forms renderer stays hard-dark.
 */
export default function PublishedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = getThemeDomain();
  const mantineTheme = mantineThemes[domain];

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className="h-full w-full overflow-x-hidden bg-background-primary">
        <ThemeProvider domain={domain}>
          <MantineProvider defaultColorScheme="auto" theme={mantineTheme}>
            {children}
          </MantineProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
