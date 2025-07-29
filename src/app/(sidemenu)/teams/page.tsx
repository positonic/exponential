import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import TeamsClient from "./TeamsClient";

export default async function TeamsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/use-the-force?callbackUrl=/teams');
  }

  return <TeamsClient currentUserId={session.user.id} />;
}