import { DesktopAuthClient } from "./DesktopAuthClient";

// Electron-only bridge: drives a client-side sign-in from credentials the
// Electron main process holds. Never prerender or cache it.
export const dynamic = "force-dynamic";

export default function DesktopAuthPage() {
  return <DesktopAuthClient />;
}
