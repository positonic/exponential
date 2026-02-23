"use client";

import { useState, useMemo, useCallback } from "react";

export interface MentionCandidate {
  id: string;
  name: string;
  type: "member" | "agent";
  image?: string | null;
}

interface UseMentionAutocompleteOptions {
  candidates: MentionCandidate[];
}

interface UseMentionAutocompleteReturn {
  showDropdown: boolean;
  filteredCandidates: MentionCandidate[];
  selectedIndex: number;
  handleInputChange: (value: string, cursorPosition: number) => void;
  /** Returns true if the key event was consumed by the dropdown */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  selectCandidate: (candidate: MentionCandidate) => void;
  dismissDropdown: () => void;
  setSelectedIndex: (index: number) => void;
  text: string;
  setText: (text: string) => void;
  cursorPosition: number;
}

/**
 * Finds the @ trigger position before the cursor, ignoring any @ that is
 * already inside bracket-delimited mentions like @[Name].
 */
function findMentionTrigger(
  text: string,
  cursorPos: number,
): { triggerIndex: number; searchTerm: string } | null {
  const before = text.substring(0, cursorPos);
  const lastAt = before.lastIndexOf("@");
  if (lastAt === -1) return null;

  // Check that this @ is not inside a bracket mention (i.e., preceded by nothing or non-[ )
  // If the character after @ is [, this is a completed mention — skip
  if (text[lastAt + 1] === "[") return null;

  const afterAt = before.substring(lastAt + 1);
  // If there's a space or newline, the mention trigger is broken
  if (/[\n]/.test(afterAt)) return null;

  return { triggerIndex: lastAt, searchTerm: afterAt.toLowerCase() };
}

export function useMentionAutocomplete({
  candidates,
}: UseMentionAutocompleteOptions): UseMentionAutocompleteReturn {
  const [text, setText] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const mentionTrigger = useMemo(
    () => findMentionTrigger(text, cursorPosition),
    [text, cursorPosition],
  );

  const filteredCandidates = useMemo(() => {
    if (!mentionTrigger) return [];
    const { searchTerm } = mentionTrigger;
    return candidates.filter((c) =>
      c.name.toLowerCase().includes(searchTerm),
    );
  }, [mentionTrigger, candidates]);

  const handleInputChange = useCallback(
    (value: string, cursorPos: number) => {
      setText(value);
      setCursorPosition(cursorPos);
      setSelectedIndex(0);

      const trigger = findMentionTrigger(value, cursorPos);
      setShowDropdown(trigger !== null);
    },
    [],
  );

  const selectCandidate = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionTrigger) return;

      const { triggerIndex } = mentionTrigger;
      const beforeTrigger = text.substring(0, triggerIndex);
      const afterCursor = text.substring(cursorPosition);
      const insertion = `@[${candidate.name}] `;
      const newText = beforeTrigger + insertion + afterCursor;

      setText(newText);
      setCursorPosition(triggerIndex + insertion.length);
      setShowDropdown(false);
      setSelectedIndex(0);
    },
    [mentionTrigger, text, cursorPosition],
  );

  const dismissDropdown = useCallback(() => {
    setShowDropdown(false);
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!showDropdown || filteredCandidates.length === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCandidates.length - 1 ? prev + 1 : 0,
        );
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCandidates.length - 1,
        );
        return true;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const candidate = filteredCandidates[selectedIndex];
        if (candidate) selectCandidate(candidate);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismissDropdown();
        return true;
      }
      if (e.key === "Tab" && filteredCandidates.length > 0) {
        e.preventDefault();
        const candidate = filteredCandidates[selectedIndex];
        if (candidate) selectCandidate(candidate);
        return true;
      }

      return false;
    },
    [showDropdown, filteredCandidates, selectedIndex, selectCandidate, dismissDropdown],
  );

  return {
    showDropdown,
    filteredCandidates,
    selectedIndex,
    handleInputChange,
    handleKeyDown,
    selectCandidate,
    dismissDropdown,
    setSelectedIndex,
    text,
    setText,
    cursorPosition,
  };
}
