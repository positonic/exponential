import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { TimePageContent } from "~/app/_components/time/TimePageContent";

export default async function TimePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <main className="flex h-full flex-col text-text-primary">
      <TimePageContent />
    </main>
  );
}
