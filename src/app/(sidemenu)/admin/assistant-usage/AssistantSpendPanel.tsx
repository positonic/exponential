"use client";

import { useEffect, useState } from "react";
import { Select, SimpleGrid, Skeleton, Table, Text, Title } from "@mantine/core";
import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui";

const MONTHS_LISTED = 6;

const SOURCE_LABEL: Record<string, string> = {
  CHAT: "Chat",
  AGENT_RUN: "Agent runs",
  VOICE: "Voice",
  DIRECT: "Direct calls",
};

/** `YYYY-MM` in UTC: usage months are UTC calendar months. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** This month and the five before it, newest first. */
function recentMonths(now: Date): Array<{ value: string; label: string }> {
  return Array.from({ length: MONTHS_LISTED }, (_, back) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return {
      value: monthKey(month),
      label: month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
}

/** Micro-USD as dollars. Four decimals below a dollar, where a turn's cost lives. */
function formatUsd(micros: number | null): string {
  if (micros === null) return "–";
  const usd = micros / 1_000_000;
  return `$${usd.toFixed(usd > 0 && usd < 1 ? 4 : 2)}`;
}

function Stat({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <Panel>
      <Text size="sm" className="text-text-muted">
        {title}
      </Text>
      <Title order={3} className="text-text-primary">
        {value}
      </Title>
      {detail && (
        <Text size="xs" className="text-text-muted">
          {detail}
        </Text>
      )}
    </Panel>
  );
}

/**
 * Admin → Assistant usage: each workspace's hosted-key Assistant spend for a
 * month, and where it sits in the distribution. For sizing the assistant
 * allowance and reconciling the ledger against the provider's invoice.
 */
export function AssistantSpendPanel() {
  // The month list depends on the clock, so it is built after mount: the
  // server render and the browser's first render then always agree (they
  // could differ either side of a month boundary). Until a month is picked,
  // the query asks for the current month, which the server works out.
  const [months, setMonths] = useState<Array<{ value: string; label: string }>>([]);
  const [month, setMonth] = useState<string>();
  useEffect(() => setMonths(recentMonths(new Date())), []);
  const { data, isLoading } = api.admin.getAssistantSpend.useQuery({ month });

  if (data?.mode === "off") {
    return (
      <div className="space-y-2">
        <Title order={2} className="text-text-primary">
          Assistant usage
        </Title>
        <Text className="text-text-muted">
          Assistant use is not metered on this install. Set BILLING_MODE to &quot;meter&quot; to start recording it.
        </Text>
      </div>
    );
  }

  const report = data?.report;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title order={2} className="text-text-primary">
            Assistant usage
          </Title>
          <Text className="text-text-muted">
            What Assistant chat, agent runs, voice and direct calls cost on the hosted key, per workspace, by calendar
            month (UTC).
          </Text>
        </div>
        <Select
          aria-label="Month"
          data={months}
          value={month ?? months[0]?.value ?? null}
          onChange={(value) => value && setMonth(value)}
          allowDeselect={false}
          w={200}
        />
      </div>

      {isLoading || !report ? (
        <Skeleton height={120} />
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
            <Stat title="Total spend" value={formatUsd(report.totalMicros)} detail="Compare with the provider's invoice" />
            <Stat
              title="Workspaces with spend"
              value={report.workspacesWithSpend.toLocaleString()}
              detail="The percentiles describe these"
            />
            <Stat title="p50" value={formatUsd(report.percentiles.p50)} detail="Half are at or under this" />
            <Stat title="p80" value={formatUsd(report.percentiles.p80)} detail="80% are at or under this" />
            <Stat title="p90" value={formatUsd(report.percentiles.p90)} detail="90% are at or under this" />
          </SimpleGrid>

          <Panel>
            <Title order={4} className="mb-2 text-text-primary">
              By source
            </Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Spend</Table.Th>
                  <Table.Th>Turns</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.bySource.map((row) => (
                  <Table.Tr key={row.source}>
                    <Table.Td>{SOURCE_LABEL[row.source] ?? row.source}</Table.Td>
                    <Table.Td>{formatUsd(row.costMicros)}</Table.Td>
                    <Table.Td>{row.events.toLocaleString()}</Table.Td>
                  </Table.Tr>
                ))}
                {report.ownKey.events > 0 && (
                  <Table.Tr>
                    <Table.Td>On a workspace&apos;s own key (not counted)</Table.Td>
                    <Table.Td>{formatUsd(report.ownKey.costMicros)}</Table.Td>
                    <Table.Td>{report.ownKey.events.toLocaleString()}</Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Panel>

          <Panel>
            <Title order={4} className="mb-2 text-text-primary">
              By workspace
            </Title>
            {report.workspaces.length === 0 ? (
              <Text className="text-text-muted">No metered Assistant use this month.</Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Workspace</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Spend</Table.Th>
                    <Table.Th>Turns</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {report.workspaces.map((row) => (
                    <Table.Tr key={row.workspaceId}>
                      <Table.Td>
                        {row.name ?? "Deleted workspace"}
                        <Text size="xs" className="text-text-muted">
                          {row.slug ?? row.workspaceId}
                        </Text>
                      </Table.Td>
                      <Table.Td>{row.type ?? "–"}</Table.Td>
                      <Table.Td>{formatUsd(row.costMicros)}</Table.Td>
                      <Table.Td>{row.events.toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            {report.workspacesWithSpend > report.workspaces.length && (
              <Text size="xs" className="mt-2 text-text-muted">
                Showing the {report.workspaces.length} highest of {report.workspacesWithSpend.toLocaleString()} workspaces.
                The summary above covers all of them.
              </Text>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
