import { WhatsAppIntegrationSettings } from '~/app/_components/WhatsAppIntegrationSettings';

export default function WhatsAppIntegrationPage({ params }: { params: { id: string } }) {
  return <WhatsAppIntegrationSettings integrationId={params.id} />;
}