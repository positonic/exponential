import { auth } from "~/server/auth";
import { FooterSection, MarketingHeader } from "~/app/_components/home";

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <MarketingHeader session={session} mobileNav />

      <main>{children}</main>

      <FooterSection />
    </div>
  );
}
