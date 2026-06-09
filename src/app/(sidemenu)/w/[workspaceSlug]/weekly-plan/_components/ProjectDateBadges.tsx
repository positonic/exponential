"use client";

import { Badge, Group } from "@mantine/core";
import { IconCalendarEvent, IconCalendarDue } from "@tabler/icons-react";
import { format, differenceInDays } from "date-fns";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";

interface ProjectDateBadgesProps {
  projectId: string;
  startDate: Date | null | undefined;
  endDate: Date | null | undefined;
  onUpdate: (dates: { startDate?: Date | null; endDate?: Date | null }) => void;
}

export function ProjectDateBadges({
  projectId: _projectId,
  startDate,
  endDate,
  onUpdate,
}: ProjectDateBadgesProps) {
  const getEndDateColor = (date: Date | null | undefined): string => {
    if (!date) return "gray";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const daysRemaining = differenceInDays(targetDate, today);

    if (daysRemaining < 0) return "red"; // Overdue
    if (daysRemaining < 3) return "red"; // Less than 3 days
    if (daysRemaining < 7) return "yellow"; // 3-7 days
    return "green"; // 7+ days
  };

  const formatDateBadge = (date: Date | null | undefined): string => {
    if (!date) return "Not set";
    return format(new Date(date), "MMM d, yyyy");
  };

  const getStartDateTooltip = (date: Date | null | undefined): string => {
    if (!date) return "Click to set start date";
    return format(new Date(date), "EEEE, MMMM d, yyyy");
  };

  const getEndDateTooltip = (date: Date | null | undefined): string => {
    if (!date) return "No due date set";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const daysRemaining = differenceInDays(targetDate, today);

    if (daysRemaining < 0) return `Overdue by ${Math.abs(daysRemaining)} days`;
    if (daysRemaining === 0) return "Due today";
    if (daysRemaining === 1) return "Due tomorrow";
    return `${daysRemaining} days remaining`;
  };

  return (
    <Group gap="sm">
      {/* Start Date */}
      <UnifiedDatePicker
        value={startDate ? new Date(startDate) : null}
        onChange={(date) => onUpdate({ startDate: date })}
        notificationContext="project start date"
        onClear={() => onUpdate({ startDate: null })}
        leftSection={<IconCalendarEvent size={14} />}
        renderTrigger={({ toggle }) => (
          <Badge
            size="lg"
            variant="light"
            color="gray"
            leftSection={<IconCalendarEvent size={14} />}
            className="cursor-pointer"
            onClick={toggle}
            title={getStartDateTooltip(startDate)}
          >
            Start: {formatDateBadge(startDate)}
          </Badge>
        )}
      />

      {/* End Date */}
      <UnifiedDatePicker
        value={endDate ? new Date(endDate) : null}
        onChange={(date) => onUpdate({ endDate: date })}
        notificationContext="project due date"
        onClear={() => onUpdate({ endDate: null })}
        leftSection={<IconCalendarDue size={14} />}
        renderTrigger={({ toggle }) => (
          <Badge
            size="lg"
            variant="light"
            color={getEndDateColor(endDate)}
            leftSection={<IconCalendarDue size={14} />}
            className="cursor-pointer"
            onClick={toggle}
            title={getEndDateTooltip(endDate)}
          >
            Due: {formatDateBadge(endDate)}
          </Badge>
        )}
      />
    </Group>
  );
}
