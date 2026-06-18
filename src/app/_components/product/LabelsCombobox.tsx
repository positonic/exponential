"use client";

import { useState } from "react";
import {
  Badge,
  CheckIcon,
  Combobox,
  Group,
  Text,
  useCombobox,
} from "@mantine/core";
import { TagBadge } from "~/app/_components/TagBadge";
import { getTagMantineColor } from "~/utils/tagColors";

type Tag = { id: string; name: string; color: string };

/**
 * Multi-select labels picker with inline create. Entity-agnostic — used by both
 * the ticket and feature detail pages. The caller owns persistence via onChange
 * (replace-all tag set) and onCreate.
 */
export function LabelsCombobox({
  selectedIds,
  allTags,
  entityTags,
  onChange,
  onCreate,
}: {
  selectedIds: string[];
  allTags: Tag[];
  entityTags: Array<{ tag: Tag }>;
  onChange: (tagIds: string[]) => void;
  onCreate: (name: string) => void;
}) {
  const combobox = useCombobox({ onDropdownClose: () => { combobox.resetSelectedOption(); setSearch(""); } });
  const [search, setSearch] = useState("");

  const filtered = allTags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase().trim()));
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === search.toLowerCase().trim());

  const toggleTag = (tagId: string) => {
    if (selectedIds.includes(tagId)) {
      onChange(selectedIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedIds, tagId]);
    }
  };

  return (
    <Combobox store={combobox} onOptionSubmit={(val) => {
      if (val === "__create") {
        onCreate(search.trim());
        combobox.closeDropdown();
      } else {
        toggleTag(val);
        // Keep dropdown open for multi-select
      }
    }}>
      <Combobox.Target>
        <div
          className="cursor-pointer min-h-[24px] flex items-center"
          onClick={() => combobox.toggleDropdown()}
        >
          {entityTags.length > 0 ? (
            <Group gap={4}>
              {entityTags.map((t) => (
                <TagBadge key={t.tag.id} tag={t.tag} size="xs" />
              ))}
            </Group>
          ) : (
            <Text size="xs" className="text-text-muted">None</Text>
          )}
        </div>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(e) => { setSearch(e.currentTarget.value); combobox.updateSelectedOptionIndex(); }}
          placeholder="Search or create..."
          size="xs"
        />
        <Combobox.Options>
          {filtered.map((tag) => {
            const isSelected = selectedIds.includes(tag.id);
            return (
              <Combobox.Option key={tag.id} value={tag.id} active={isSelected}>
                <div className="flex items-center gap-2">
                  {isSelected && <CheckIcon size={12} />}
                  <Badge size="xs" variant="light" color={getTagMantineColor(tag.color)}>{tag.name}</Badge>
                </div>
              </Combobox.Option>
            );
          })}
          {search.trim() && !exactMatch && (
            <Combobox.Option value="__create">
              <Text size="xs" className="text-blue-400">+ Create &quot;{search.trim()}&quot;</Text>
            </Combobox.Option>
          )}
          {!search.trim() && filtered.length === 0 && (
            <Combobox.Empty>
              <Text size="xs" className="text-text-muted">No labels</Text>
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
