"use client";

import { Card, Text, Group, SimpleGrid } from "@mantine/core";
import {
  IconDatabase,
  IconMicrophone,
  IconUsers,
  IconTargetArrow,
  IconSettings,
  IconArrowRight,
} from "@tabler/icons-react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { usePluginNavigation } from "~/hooks/usePluginNavigation";

interface SectionCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SectionCard({ href, icon, title, description }: SectionCardProps) {
  return (
    <Card
      component={Link}
      href={href}
      withBorder
      radius="md"
      className="cursor-pointer border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
      p="md"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {icon}
          <div>
            <Text fw={600} size="sm" className="text-text-primary">
              {title}
            </Text>
            <Text size="xs" className="text-text-muted">
              {description}
            </Text>
          </div>
        </Group>
        <IconArrowRight size={14} className="text-text-muted" />
      </Group>
    </Card>
  );
}

export function WorkspaceSectionCards() {
  const { workspaceSlug } = useWorkspace();
  const { enabledPlugins } = usePluginNavigation();

  if (!workspaceSlug) return null;

  const isCrmEnabled = enabledPlugins.includes("crm");
  const isOkrEnabled = enabledPlugins.includes("okr");

  return (
    <div className="mb-6">
      <Text fw={600} size="sm" className="mb-3 text-text-secondary">
        Workspace
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        <SectionCard
          href={`/w/${workspaceSlug}/knowledge-base`}
          icon={<IconDatabase size={20} className="text-blue-400" />}
          title="Knowledge Hub"
          description="Documents and shared knowledge"
        />
        <SectionCard
          href={`/w/${workspaceSlug}/meetings`}
          icon={<IconMicrophone size={20} className="text-violet-400" />}
          title="Meetings"
          description="Meeting notes and recordings"
        />
        {isCrmEnabled && (
          <SectionCard
            href={`/w/${workspaceSlug}/crm`}
            icon={<IconUsers size={20} className="text-emerald-400" />}
            title="CRM"
            description="Contacts and relationships"
          />
        )}
        {isOkrEnabled && (
          <SectionCard
            href={`/w/${workspaceSlug}/okrs`}
            icon={<IconTargetArrow size={20} className="text-amber-400" />}
            title="OKRs"
            description="Objectives and key results"
          />
        )}
        <SectionCard
          href={`/w/${workspaceSlug}/settings`}
          icon={<IconSettings size={20} className="text-gray-400" />}
          title="Settings"
          description="Workspace configuration"
        />
      </SimpleGrid>
    </div>
  );
}
