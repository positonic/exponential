import Link from "next/link";
import { auth } from "~/server/auth";
import { LogoDisplay } from "./LogoDisplay";
import { themes } from "~/config/themes";
import { getThemeDomain } from '~/config/site';

export default async function Header() {
  const session = await auth();
  const domain = getThemeDomain();
  const theme = themes[domain];

  if (session?.user) {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background-secondary border-b border-border-primary">
      <div className="flex justify-between items-center px-4 py-3">
        <LogoDisplay theme={theme} href="/"/>
        <Link
          href="/signin"
          className="px-4 py-2 rounded-lg text-red-400 hover:bg-surface-hover transition-colors"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
} 