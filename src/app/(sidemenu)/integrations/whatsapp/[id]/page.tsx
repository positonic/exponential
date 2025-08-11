import { WhatsAppIntegrationSettings } from '~/app/_components/WhatsAppIntegrationSettings';

export default async function WhatsAppIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WhatsAppIntegrationSettings integrationId={id} />;
}