import { notFound } from "next/navigation";

import { ClientToolsSpike } from "./ClientToolsSpike";

/**
 * Dev-only harness for the V2 transport spike. Throwaway scaffolding — it exists
 * to answer a go/no-go question, not to ship.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ClientToolsSpike />;
}
