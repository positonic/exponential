"use client";

import { Badge, Group, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendarEvent, IconCalendarDue } from "@tabler/icons-react";
import { format, differenceInDays } from "date-fns";
import { useState } from "react";

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
  const [isEditingStart, setIsEditingStart] = useState(false);
  const [isEditingEnd, setIsEditingEnd] = useState(false);

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
      {isEditingStart ? (
        <DatePickerInput
          placeholder="Select start date"
          value={startDate ? new Date(startDate) : null}
          onChange={(value) => {
            onUpdate({ startDate: value });
            setIsEditingStart(false);
          }}
          clearable
          popoverProps={{ opened: true, onClose: () => setIsEditingStart(false) }}
          size="xs"
          w={180}
          leftSection={<IconCalendarEvent size={14} />}
        />
      ) : (
        <Tooltip label={startDate ? format(new Date(startDate), "EEEE, MMMM d, yyyy") : "Click to set start date"} withArrow>
          <Badge
            size="lg"
            variant="light"
            color="gray"
            leftSection={<IconCalendarEvent size={14} />}
            className="cursor-pointer"
            onClick={() => setIsEditingStart(true)}
          >
            Start: {formatDateBadge(startDate)}
          </Badge>
        </Tooltip>
      )}

      {/* End Date */}
      {isEditingEnd ? (
        <DatePickerInput
          placeholder="Select due date"
          value={endDate ? new Date(endDate) : null}
          onChange={(value) => {
            onUpdate({ endDate: value });
            setIsEditingEnd(false);
          }}
          clearable
          popoverProps={{ opened: true, onClose: () => setIsEditingEnd(false) }}
          size="xs"
          w={180}
          leftSection={<IconCalendarDue size={14} />}
        />
      ) : (
        <Tooltip label={getEndDateTooltip(endDate)} withArrow>
          <Badge
            size="lg"
            variant="light"
            color={getEndDateColor(endDate)}
            leftSection={<IconCalendarDue size={14} />}
            className="cursor-pointer"
            onClick={() => setIsEditingEnd(true)}
          >
            Due: {formatDateBadge(endDate)}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}
