"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ActionIcon, TextInput } from "@mantine/core";
import { IconSearch, IconX } from "@tabler/icons-react";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search...",
}: SearchBoxProps) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  const handleCollapse = useCallback(() => {
    if (!value) {
      setExpanded(false);
    }
  }, [value]);

  const handleClear = useCallback(() => {
    onChange("");
    setExpanded(false);
  }, [onChange]);

  if (!expanded) {
    return (
      <ActionIcon
        variant="subtle"
        color="gray"
        size="md"
        onClick={() => setExpanded(true)}
        aria-label="Open search"
      >
        <IconSearch size={18} />
      </ActionIcon>
    );
  }

  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      placeholder={placeholder}
      size="xs"
      leftSection={<IconSearch size={14} />}
      rightSection={
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <IconX size={12} />
        </ActionIcon>
      }
      onBlur={handleCollapse}
      className="w-48 transition-all duration-200"
    />
  );
}
