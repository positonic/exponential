import { Container, Stack } from "@mantine/core";
import {
  GooglePremiumFeature,
  type GooglePremiumFeatureKind,
} from "~/app/_components/GooglePremiumFeature";

/**
 * Landing page for users who tried to start a Google OAuth flow that needs a
 * scope Google hasn't verified yet. `/api/auth/google-calendar` redirects here
 * instead of handing them to Google's "unverified app" error screen.
 */
export default async function GoogleAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  const kind: GooglePremiumFeatureKind =
    feature === "contacts" ? "contacts" : "calendar";

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <GooglePremiumFeature feature={kind} variant="card" />
      </Stack>
    </Container>
  );
}
