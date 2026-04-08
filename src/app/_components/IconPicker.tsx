"use client";

import { useState, useMemo } from "react";
import {
  Popover,
  Tabs,
  TextInput,
  ScrollArea,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch, IconX } from "@tabler/icons-react";
import {
  PICKER_ICONS,
  PICKER_EMOJIS,
  ICON_COLORS,
  getIconColorValue,
} from "./iconPickerData";
import { ICON_MAP } from "./GoalIcon";

interface IconPickerProps {
  value: string | null | undefined;
  color: string | null | undefined;
  onChange: (icon: string | null, color: string | null) => void;
  children: React.ReactNode;
}

export function IconPicker({ value, color, onChange, children }: IconPickerProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedColor, setSelectedColor] = useState(color ?? "purple");

  // Filter icons by search
  const filteredIcons = useMemo(() => {
    if (!search.trim()) return PICKER_ICONS;
    const q = search.toLowerCase();
    const result: Record<string, string[]> = {};
    for (const [category, icons] of Object.entries(PICKER_ICONS)) {
      const matches = icons.filter((name) =>
        name.toLowerCase().replace("icon", "").includes(q),
      );
      if (matches.length > 0) result[category] = matches;
    }
    return result;
  }, [search]);

  // Filter emojis by search (simple text matching on emoji itself)
  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return PICKER_EMOJIS;
    // For emojis, search is limited — just filter to show all when searching
    return PICKER_EMOJIS;
  }, [search]);

  const handleSelectIcon = (iconName: string) => {
    onChange(`tabler:${iconName}`, selectedColor);
    setOpened(false);
    setSearch("");
  };

  const handleSelectEmoji = (emoji: string) => {
    onChange(`emoji:${emoji}`, null);
    setOpened(false);
    setSearch("");
  };

  const handleRemove = () => {
    onChange(null, null);
    setOpened(false);
    setSearch("");
  };

  const handleColorSelect = (colorKey: string) => {
    setSelectedColor(colorKey);
    // If current value is a tabler icon, update its color immediately
    if (value?.startsWith("tabler:")) {
      onChange(value, colorKey);
    }
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      shadow="md"
      radius="md"
      width={360}
      position="bottom-start"
    >
      <Popover.Target>
        <UnstyledButton onClick={() => setOpened((o) => !o)}>
          {children}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Tabs defaultValue="icons">
          <Tabs.List px="sm" pt="xs">
            <Tabs.Tab value="icons" size="sm">
              Icons
            </Tabs.Tab>
            <Tabs.Tab value="emojis" size="sm">
              Emojis
            </Tabs.Tab>
          </Tabs.List>

          {/* Icons Tab */}
          <Tabs.Panel value="icons">
            {/* Color picker row */}
            <div className="flex items-center gap-1.5 px-3 py-2">
              {ICON_COLORS.map((c) => (
                <UnstyledButton
                  key={c.key}
                  onClick={() => handleColorSelect(c.key)}
                  className="flex items-center justify-center rounded-full transition-transform"
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: c.value,
                    outline:
                      selectedColor === c.key
                        ? "2px solid var(--mantine-color-blue-5)"
                        : "none",
                    outlineOffset: 2,
                  }}
                  aria-label={c.label}
                >
                  {selectedColor === c.key && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 6L5 9L10 3"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </UnstyledButton>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
              <TextInput
                placeholder="Search icons..."
                size="xs"
                leftSection={<IconSearch size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
              />
            </div>

            {/* Icon grid */}
            <ScrollArea.Autosize mah={280} px="sm" pb="sm">
              {Object.entries(filteredIcons).map(([category, icons]) => (
                <div key={category} className="mb-2">
                  <Text size="xs" c="dimmed" mb={4}>
                    {category}
                  </Text>
                  <div className="grid grid-cols-8 gap-0.5">
                    {icons.map((iconName) => {
                      const IconComp = ICON_MAP[iconName];
                      if (!IconComp) return null;
                      const isSelected =
                        value === `tabler:${iconName}`;
                      return (
                        <UnstyledButton
                          key={iconName}
                          onClick={() => handleSelectIcon(iconName)}
                          className="flex items-center justify-center rounded transition-colors hover:bg-surface-hover"
                          style={{
                            width: 36,
                            height: 36,
                            backgroundColor: isSelected
                              ? "var(--mantine-color-dark-5)"
                              : undefined,
                          }}
                          aria-label={iconName.replace("Icon", "")}
                        >
                          <IconComp
                            size={20}
                            style={{
                              color: getIconColorValue(selectedColor),
                            }}
                          />
                        </UnstyledButton>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(filteredIcons).length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No icons found
                </Text>
              )}
            </ScrollArea.Autosize>
          </Tabs.Panel>

          {/* Emojis Tab */}
          <Tabs.Panel value="emojis">
            {/* Search */}
            <div className="px-3 pt-2 pb-2">
              <TextInput
                placeholder="Search emoji..."
                size="xs"
                leftSection={<IconSearch size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
              />
            </div>

            {/* Emoji grid */}
            <ScrollArea.Autosize mah={300} px="sm" pb="sm">
              {Object.entries(filteredEmojis).map(([category, emojis]) => (
                <div key={category} className="mb-2">
                  <Text size="xs" c="dimmed" mb={4}>
                    {category}
                  </Text>
                  <div className="grid grid-cols-8 gap-0.5">
                    {emojis.map((emoji, idx) => {
                      const isSelected = value === `emoji:${emoji}`;
                      return (
                        <button
                          key={`${emoji}-${idx}`}
                          type="button"
                          className="flex items-center justify-center rounded text-lg transition-colors hover:bg-surface-hover cursor-pointer"
                          style={{
                            width: 36,
                            height: 36,
                            backgroundColor: isSelected
                              ? "var(--mantine-color-dark-5)"
                              : undefined,
                          }}
                          onClick={() => handleSelectEmoji(emoji)}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </ScrollArea.Autosize>
          </Tabs.Panel>
        </Tabs>

        {/* Remove button */}
        {value && (
          <div className="border-t border-border-primary px-3 py-2">
            <UnstyledButton
              onClick={handleRemove}
              className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
            >
              <IconX size={14} />
              <Text size="xs">Remove icon</Text>
            </UnstyledButton>
          </div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
