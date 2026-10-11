import { ExternalAgentsSettings } from './_components/ExternalAgentsSettings';

/**
 * The agents list lives in the layout, not a page, so it stays mounted across
 * `/settings/agents` ↔ `/settings/agents/new`: the URL only opens and closes
 * the create drawer, without refetching or losing scroll position.
 */
export default function AgentsSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ExternalAgentsSettings />
      {children}
    </>
  );
}
