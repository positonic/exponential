"use client";

import { Avatar, Group, HoverCard, Stack, Text, Title } from "@mantine/core";
import { IconClockHour4 } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { formatMinutes } from "~/app/_components/metrics/format";
import { PropertyRow } from "~/app/_components/PropertiesSidebar";
import type { ProjectTimeReport } from "~/server/services/timeEntry/projectTimeReport";

/**
 * Logged time where nobody picks it: on a Ticket, rolled up to its Feature,
 * and inside a Cycle's window. The Timer only ever asks for a Ticket or a
 * Project; these are derived from it (CONTEXT.md, "Timer").
 *
 * The headline is confirmed time, as on the project Time tab. Hovering lists
 * it per person; proposed (unconfirmed worklog) and agent-run time are named
 * beside it, never added in.
 */

function hasAnyTime(report: ProjectTimeReport): boolean {
  return report.people.length > 0 || report.agentRunMinutes > 0;
}

function Breakdown({ report, note }: { report: ProjectTimeReport; note?: string }) {
  return (
    <Stack gap={6}>
      {report.people.map((person) => {
        const displayName = person.name ?? "Unnamed";
        return (
          <Group key={person.userId} justify="space-between" wrap="nowrap" gap="md">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar src={person.image} radius="xl" size={18}>
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Text size="xs" className="text-text-primary" truncate>
                {displayName}
              </Text>
            </Group>
            <Text size="xs" fw={600} className="text-text-primary" style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {formatMinutes(person.confirmedMinutes)}
              {person.proposedMinutes > 0 && (
                <Text span size="xs" fw={400} className="text-text-muted">
                  {` +${formatMinutes(person.proposedMinutes)}`}
                </Text>
              )}
            </Text>
          </Group>
        );
      })}
      {report.proposedMinutes > 0 && (
        <Text size="xs" className="text-text-muted">
          +{formatMinutes(report.proposedMinutes)} proposed, awaiting confirmation (not in the total)
        </Text>
      )}
      {report.agentRunMinutes > 0 && (
        <Text size="xs" className="text-text-muted">
          {formatMinutes(report.agentRunMinutes)} agent-run (not in the total)
        </Text>
      )}
      {note && (
        <Text size="xs" className="text-text-muted">
          {note}
        </Text>
      )}
    </Stack>
  );
}

/** The confirmed total, with the per-person breakdown on hover. */
function TimeTotal({
  report,
  variant,
  note,
}: {
  report: ProjectTimeReport;
  variant: "row" | "stat";
  note?: string;
}) {
  const total = formatMinutes(report.confirmedMinutes);
  const people = report.people.length;
  const target =
    variant === "stat" ? (
      <Title order={4} className="text-text-primary" style={{ fontVariantNumeric: "tabular-nums", cursor: "default" }}>
        {total}
      </Title>
    ) : (
      <Text size="xs" className="text-text-primary" style={{ fontVariantNumeric: "tabular-nums", cursor: "default" }}>
        {total}
        {people > 0 && (
          <Text span size="xs" className="text-text-muted">
            {` · ${people} ${people === 1 ? "person" : "people"}`}
          </Text>
        )}
      </Text>
    );
  return (
    <HoverCard width={260} shadow="md" radius="md" openDelay={150} withinPortal position="bottom-start">
      <HoverCard.Target>
        <span className="inline-block">{target}</span>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Breakdown report={report} note={note} />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function RowValue({ report, isLoading }: { report: ProjectTimeReport | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Text size="xs" className="text-text-muted">
        …
      </Text>
    );
  }
  if (!report || !hasAnyTime(report)) {
    return (
      <Text size="xs" className="text-text-muted">
        None yet
      </Text>
    );
  }
  return <TimeTotal report={report} variant="row" />;
}

/** "Time" row for the ticket sidebar. Hidden when the caller can't read it. */
export function TicketTimeRow({ ticketId }: { ticketId: string }) {
  const { data, isLoading, error } = api.timeEntry.ticketSummary.useQuery({ ticketId });
  if (error) return null;
  return (
    <PropertyRow icon={<IconClockHour4 size={14} />} label="Time">
      <RowValue report={data} isLoading={isLoading} />
    </PropertyRow>
  );
}

/** "Time" row for the feature sidebar: the sum over its tickets. */
export function FeatureTimeRow({ featureId }: { featureId: string }) {
  const { data, isLoading, error } = api.timeEntry.featureSummary.useQuery({ featureId });
  if (error) return null;
  return (
    <PropertyRow icon={<IconClockHour4 size={14} />} label="Time">
      <RowValue report={data} isLoading={isLoading} />
    </PropertyRow>
  );
}

/**
 * "Time logged" stat for the cycle summary: time that started inside the
 * cycle's dates on its product's tickets.
 */
export function CycleTimeStat({ cycleId }: { cycleId: string }) {
  const { data, isLoading, error } = api.timeEntry.cycleSummary.useQuery({ cycleId });
  if (error) return null;
  return (
    <div>
      <Text size="xs" className="text-text-muted">
        Time logged
      </Text>
      {isLoading || !data ? (
        <Title order={4} className="text-text-muted">
          …
        </Title>
      ) : hasAnyTime(data) ? (
        <TimeTotal
          report={data}
          variant="stat"
          note="Time that started between the cycle's dates, on any of this product's tickets."
        />
      ) : (
        <Title order={4} className="text-text-primary">
          {formatMinutes(0)}
        </Title>
      )}
    </div>
  );
}
