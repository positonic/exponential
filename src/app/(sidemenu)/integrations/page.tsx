import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import IntegrationsClient from "./IntegrationsClient";

export default async function IntegrationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/signin?callbackUrl=/integrations');
  }

  return <IntegrationsClient />;
}