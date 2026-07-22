import { Suspense } from "react";

import { DesktopAuthClient } from "./DesktopAuthClient";

// This page consumes one-time query params and drives a client-side sign-in;
// never prerender or cache it.
export const dynamic = "force-dynamic";

export default function DesktopAuthPage() {
  // useSearchParams (in the client child) requires a Suspense boundary.
  return (
    <Suspense>
      <DesktopAuthClient />
    </Suspense>
  );
}
