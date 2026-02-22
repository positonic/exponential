"use client";

import {
  Badge,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  SegmentedControl,
  Loader,
  Center,
  Button,
} from "@mantine/core";
import { IconCoin, IconCode, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "~/trpc/react";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "green",
  intermediate: "yellow",
  advanced: "red",
};

export function ExplorePageClient() {
  const [difficulty, setDifficulty] = useState<string>("all");

  const { data: bountiesData, isLoading: bountiesLoading } =
    api.bounty.listPublic.useQuery({
      limit: 50,
      ...(difficulty !== "all" ? { difficulty } : {}),
    });

  const { data: projectsData, isLoading: projectsLoading } =
    api.bounty.listPublicProjects.useQuery({ limit: 20 });

  const bounties = bountiesData?.bounties ?? [];
  const projects = projectsData?.projects ?? [];
  const isLoading = bountiesLoading || projectsLoading;

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Title order={1} className="text-text-primary">
            Explore Bounties
          </Title>
          <Text size="lg" className="text-text-secondary" mt="xs">
            Find open bounties across public projects. Claim work, submit
            solutions, earn rewards.
          </Text>
        </div>

        {/* Projects Section */}
        {projects.length > 0 && (
          <div>
            <Title order={3} className="text-text-primary" mb="md">
              Projects
            </Title>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  component={Link}
                  href={`/explore/${project.slug}`}
                  withBorder
                  radius="md"
                  className="border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
                  p="md"
                >
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} className="text-text-primary" truncate>
                        {project.name}
                      </Text>
                      {project.description && (
                        <Text
                          size="sm"
                          className="text-text-secondary"
                          lineClamp={2}
                          mt={4}
                        >
                          {project.description}
                        </Text>
                      )}
                    </div>
                    <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                      <Badge variant="light" size="sm">
                        {project._count.actions} bounties
                      </Badge>
                      <IconArrowRight
                        size={16}
                        className="text-text-muted"
                      />
                    </Stack>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          </div>
        )}

        {/* Bounties Section */}
        <div>
          <Group justify="space-between" mb="md">
            <Title order={3} className="text-text-primary">
              Open Bounties
            </Title>
            <SegmentedControl
              size="xs"
              value={difficulty}
              onChange={setDifficulty}
              data={[
                { label: "All", value: "all" },
                { label: "Beginner", value: "beginner" },
                { label: "Intermediate", value: "intermediate" },
                { label: "Advanced", value: "advanced" },
              ]}
            />
          </Group>

          {isLoading ? (
            <Center py="xl">
              <Loader size="md" />
            </Center>
          ) : bounties.length === 0 ? (
            <Center py="xl">
              <Text className="text-text-muted">
                No bounties found{difficulty !== "all" ? ` for ${difficulty} difficulty` : ""}.
              </Text>
            </Center>
          ) : (
            <Stack gap="sm">
              {bounties.map((bounty) => (
                <Card
                  key={bounty.id}
                  component={Link}
                  href={`/explore/${bounty.project?.slug ?? ""}/bounties/${bounty.id}`}
                  withBorder
                  radius="md"
                  className="border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
                  p="md"
                >
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text
                          fw={600}
                          className="text-text-primary"
                          truncate
                        >
                          {bounty.name}
                        </Text>
                        {bounty.bountyDifficulty && (
                          <Badge
                            variant="light"
                            color={
                              DIFFICULTY_COLORS[bounty.bountyDifficulty] ??
                              "gray"
                            }
                            size="xs"
                          >
                            {bounty.bountyDifficulty}
                          </Badge>
                        )}
                      </Group>
                      {bounty.description && (
                        <Text
                          size="sm"
                          className="text-text-secondary"
                          lineClamp={1}
                          mt={4}
                        >
                          {bounty.description}
                        </Text>
                      )}
                      <Group gap="xs" mt="xs">
                        {bounty.project && (
                          <Text size="xs" className="text-text-muted">
                            {bounty.project.name}
                          </Text>
                        )}
                        {bounty.bountySkills.length > 0 && (
                          <Group gap={4}>
                            {bounty.bountySkills.slice(0, 3).map((skill) => (
                              <Badge
                                key={skill}
                                variant="outline"
                                size="xs"
                              >
                                {skill}
                              </Badge>
                            ))}
                            {bounty.bountySkills.length > 3 && (
                              <Text size="xs" className="text-text-muted">
                                +{bounty.bountySkills.length - 3}
                              </Text>
                            )}
                          </Group>
                        )}
                      </Group>
                    </div>
                    <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                      {bounty.bountyAmount && (
                        <Group gap={4}>
                          <IconCoin size={14} className="text-text-muted" />
                          <Text size="sm" fw={600} className="text-text-primary">
                            {bounty.bountyAmount.toString()}{" "}
                            {bounty.bountyToken ?? ""}
                          </Text>
                        </Group>
                      )}
                      <Group gap={4}>
                        <IconCode size={14} className="text-text-muted" />
                        <Text size="xs" className="text-text-muted">
                          {bounty._count.bountyClaims} claimed
                        </Text>
                      </Group>
                    </Stack>
                  </Group>
                </Card>
              ))}
              {bountiesData?.nextCursor && (
                <Center>
                  <Button variant="subtle" size="sm">
                    Load more
                  </Button>
                </Center>
              )}
            </Stack>
          )}
        </div>
      </Stack>
    </Container>
  );
}
