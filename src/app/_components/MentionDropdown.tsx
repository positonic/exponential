"use client";

import { Paper, Avatar, Badge, Text } from "@mantine/core";
import { forwardRef } from "react";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";
import {
  getAvatarColor,
  getInitial,
  getColorSeed,
  getTextColor,
} from "~/utils/avatarColors";

interface MentionDropdownProps {
  candidates: MentionCandidate[];
  selectedIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onHoverIndex: (index: number) => void;
}

export const MentionDropdown = forwardRef<HTMLDivElement, MentionDropdownProps>(
  function MentionDropdown({ candidates, selectedIndex, onSelect, onHoverIndex }, ref) {
    if (candidates.length === 0) {
      return (
        <Paper
          ref={ref}
          className="absolute bottom-full left-0 right-0 mb-2 bg-surface-primary border border-border-primary rounded-xl shadow-2xl overflow-hidden"
          style={{ zIndex: 1000 }}
        >
          <div className="p-3 text-center">
            <Text size="sm" className="text-text-muted">
              No matches found
            </Text>
          </div>
        </Paper>
      );
    }

    return (
      <Paper
        ref={ref}
        className="absolute bottom-full left-0 right-0 mb-2 bg-surface-primary border border-border-primary rounded-xl shadow-2xl overflow-hidden"
        style={{ zIndex: 1000 }}
      >
        <div className="max-h-48 overflow-y-auto">
          {candidates.map((candidate, index) => {
            const colorSeed = getColorSeed(candidate.name, null);
            const avatarBg = !candidate.image
              ? getAvatarColor(colorSeed)
              : undefined;
            const avatarText = avatarBg ? getTextColor(avatarBg) : "white";
            const initial = getInitial(candidate.name, null);

            return (
              <div
                key={`${candidate.type}-${candidate.id}`}
                onClick={() => onSelect(candidate)}
                onMouseEnter={() => onHoverIndex(index)}
                className={`flex items-center gap-3 p-3 cursor-pointer transition-all duration-200 ${
                  index === selectedIndex
                    ? "bg-brand-primary/20 border-l-2 border-brand-primary"
                    : "hover:bg-surface-hover"
                }`}
              >
                <Avatar
                  size="sm"
                  src={candidate.image}
                  radius="xl"
                  styles={{
                    root: {
                      backgroundColor: avatarBg,
                      color: avatarText,
                      fontWeight: 600,
                      fontSize: "12px",
                      flexShrink: 0,
                    },
                  }}
                >
                  {!candidate.image && initial}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <Text size="sm" fw={500} className="text-text-primary truncate">
                    @{candidate.name}
                  </Text>
                </div>
                <Badge
                  size="xs"
                  variant="light"
                  color={candidate.type === "member" ? "blue" : "grape"}
                >
                  {candidate.type === "member" ? "Member" : "Agent"}
                </Badge>
                {index === selectedIndex && (
                  <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </Paper>
    );
  },
);
