"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  IconHome,
  IconLayoutList,
  IconBulb,
  IconCalendarClock,
  IconClipboardList,
  IconSettings,
  IconPlus,
  IconAffiliate,
  IconTargetArrow,
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
  { value: "problems", href: "/problems", label: "Problems", icon: IconTargetArrow },
  { value: "backlog", href: "/tickets", label: "Backlog", icon: IconLayoutList },
  { value: "features", href: "/features", label: "Features", icon: IconBulb },
  { value: "graph", href: "/graph", label: "Graph", icon: IconAffiliate },
  { value: "cycles", href: "/cycles", label: "Cycles", icon: IconCalendarClock },
  { value: "research", href: "/research", label: "Insights", icon: IconBulb },
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

  // Warm every sibling tab's route (RSC payload + JS chunk) as soon as a
  // product page mounts, so the first click on any tab is instant instead of
  // paying the cold route-fetch cost. Mirrors what Next <Link> prefetch does
  // for in-viewport links; no-op in dev (Next disables prefetch there).
  useEffect(() => {
    if (!workspace) return;
    const base = `/w/${workspace.slug}/products/${productSlug}`;
    for (const tab of tabs) {
      router.prefetch(`${base}${tab.href}`);
    }
  }, [workspace, productSlug, router]);

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;
  const isSettings = pathname === `${basePath}/settings` || pathname.startsWith(`${basePath}/settings/`);

  // Settings gets its own standalone page - no header or tabs
  if (isSettings) {
    return <div className="w-full">{children}</div>;
  }

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
      <div className="w-full px-10 pt-6 mb-6">
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
          <Tabs.List className="px-10">
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

          {/* Tab content */}
          <div className="px-10 pb-6">{children}</div>
        </Stack>
      </Tabs>
    </div>
  );
}
