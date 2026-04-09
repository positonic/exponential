"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import {
  IconHome,
  IconLayoutList,
  IconBulb,
  IconCalendarClock,
  IconMicrophone,
  IconClipboardList,
  IconSettings,
  IconPlus,
} from "@tabler/icons-react";
import {
  ActionIcon,
  Group,
  Skeleton,
  Tabs,
  Text,
  Title,
  Stack,
} from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

const tabs = [
  { value: "overview", href: "", label: "Overview", icon: IconHome },
  { value: "backlog", href: "/tickets", label: "Backlog", icon: IconLayoutList },
  { value: "features", href: "/features", label: "Features", icon: IconBulb },
  { value: "cycles", href: "/cycles", label: "Cycles", icon: IconCalendarClock },
  { value: "research", href: "/research", label: "Research", icon: IconMicrophone },
  { value: "retro", href: "/retrospectives", label: "Retro", icon: IconClipboardList },
] as const;

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product, isLoading } = api.product.product.getBySlug.useQuery(
    {
      workspaceId: workspaceId ?? "",
      slug: productSlug,
    },
    { enabled: !!workspaceId && !!productSlug },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;

  // Determine active tab from pathname
  const activeTab =
    tabs.find(
      (t) =>
        t.href !== "" &&
        (pathname === `${basePath}${t.href}` ||
          pathname.startsWith(`${basePath}${t.href}/`)),
    )?.value ?? "overview";

  const handleTabChange = (value: string | null) => {
    const tab = tabs.find((t) => t.value === value);
    if (tab) {
      router.push(`${basePath}${tab.href}`);
    }
  };

  return (
    <div className="w-full">
      {/* Header: Title + action icons */}
      <div className="w-full pl-8 mb-6" style={{ paddingRight: 0 }}>
        <Group justify="space-between" align="flex-start">
          <div>
            {isLoading ? (
              <Skeleton height={32} width={220} mb={4} />
            ) : product ? (
              <>
                <Title
                  order={2}
                  mb={4}
                  className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent"
                >
                  {product.name}
                </Title>
                {product.description && (
                  <Text size="sm" c="dimmed" lineClamp={2} maw={800}>
                    {product.description}
                  </Text>
                )}
              </>
            ) : (
              <Text className="text-text-muted">Product not found</Text>
            )}
          </div>
          <Group gap="xs">
            <ActionIcon
              variant="filled"
              size="lg"
              title="Add"
              className="hover:scale-105"
              style={{ transition: "all 0.2s ease" }}
            >
              <IconPlus size={20} />
            </ActionIcon>
            <ActionIcon
              variant="filled"
              size="lg"
              title="Product Settings"
              className="hover:scale-105"
              style={{ transition: "all 0.2s ease" }}
              onClick={() => router.push(`${basePath}/settings`)}
            >
              <IconSettings size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Stack gap="xl" align="stretch" justify="flex-start">
          <Tabs.List>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Tabs.Tab
                  key={tab.value}
                  value={tab.value}
                  leftSection={<Icon size={16} />}
                >
                  {tab.label}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>

          {/* Tab content — rendered by sub-route pages */}
          <div>{children}</div>
        </Stack>
      </Tabs>
    </div>
  );
}
