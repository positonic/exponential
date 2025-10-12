import { OneOnOneBoard } from "~/app/_components/OneOnOneBoard";
import { ShareableLinks } from "~/app/_components/ShareableLinks";
import { Container, Group, Button, Title, Text } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import Link from "next/link";

export default function WeeklyReviewPage() {
  return (
    <>
      {/* Header with Settings Link */}
      <Container size="xl" py="md">
        <Group justify="space-between" align="center">
          <div>
            <Title order={1} className="text-text-primary">
              Weekly Review
            </Title>
            <Text size="sm" c="dimmed">
              Review your active projects and weekly outcomes
            </Text>
          </div>
          <Button
            variant="light"
            leftSection={<IconSettings size={16} />}
            component={Link}
            href="/weekly-review/settings"
          >
            Sharing Settings
          </Button>
        </Group>
      </Container>
      
      {/* Shareable Links Section */}
      <Container size="xl" py="md">
        <ShareableLinks />
      </Container>
      
      {/* Main Content */}
      <OneOnOneBoard />
    </>
  );
}