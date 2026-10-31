"use client";

import { useEffect, useState } from "react";
import { ActionIcon, Button, Popover, Select, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import {
  ADDABLE_PROPERTY_TYPES,
  hasOptions,
  type PillColor,
  type PropertyDef,
  type PropertyType,
} from "~/lib/databases/schema";
import styles from "./DatabaseBlock.module.css";

const TYPE_LABELS: Record<PropertyType, string> = {
  title: "Title",
  text: "Text",
  number: "Number",
  select: "Select",
  multiSelect: "Multi-select",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  person: "Person",
  relation: "Relation",
  createdTime: "Created time",
  lastEditedTime: "Last edited time",
  createdBy: "Created by",
};

/** An option as the editor holds it: existing ones keep their id. */
export interface OptionDraft {
  id?: string;
  name: string;
  color?: PillColor;
}

export interface PropertyDraft {
  name: string;
  type: PropertyType;
  description?: string;
  options?: OptionDraft[];
}

interface PropertyEditorPopoverProps {
  /** Editing an existing property, or adding (undefined). */
  property?: PropertyDef;
  /** What opens the popover: the column header, or the "+" at the end. */
  target: React.ReactNode;
  onSubmit: (draft: PropertyDraft) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}

/**
 * The header's property editor (ADR-0078 §6): name, type and — for select
 * and multi-select — the option list, in a popover off the column header.
 * Options keep their ids through a rename, so changing "Tracked" to "Being
 * tracked" rewrites no row; a removed option's rows read as its raw id until
 * they are next written. The title property can be renamed but not retyped
 * or removed.
 */
export function PropertyEditorPopover({ property, target, onSubmit, onRemove }: PropertyEditorPopoverProps) {
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState(property?.name ?? "");
  const [type, setType] = useState<PropertyType>(property?.type ?? "text");
  const [options, setOptions] = useState<OptionDraft[]>(property?.options ?? []);
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);
  const isTitle = property?.type === "title";

  useEffect(() => {
    if (!opened) return;
    setName(property?.name ?? "");
    setType(property?.type ?? "text");
    setOptions(property?.options ?? []);
    setNewOption("");
  }, [opened, property]);

  const typeChoices = (isTitle ? (["title"] as PropertyType[]) : ADDABLE_PROPERTY_TYPES).map((t) => ({
    value: t,
    label: TYPE_LABELS[t],
  }));

  const addOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed || options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase())) return;
    setOptions((prev) => [...prev, { name: trimmed }]);
    setNewOption("");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSubmit({
        name: trimmed,
        type,
        ...(hasOptions(type) ? { options } : {}),
      });
      setOpened(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!onRemove) return;
    setSaving(true);
    try {
      await onRemove();
      setOpened(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withinPortal shadow="md" trapFocus>
      <Popover.Target>
        <UnstyledButton
          className={styles.headerButton}
          aria-label={property ? `Edit property ${property.name}` : "Add a property"}
          onClick={(e) => {
            e.stopPropagation();
            setOpened((o) => !o);
          }}
        >
          {target}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        styles={{
          dropdown: {
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            minWidth: 260,
            maxWidth: 320,
          },
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <Text size="xs" fw={600} className="text-text-primary">
            {property ? "Edit property" : "New property"}
          </Text>
          <TextInput
            size="xs"
            label="Name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <Select
            size="xs"
            label="Type"
            data={typeChoices}
            value={type}
            disabled={isTitle}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(next) => {
              if (next) setType(next as PropertyType);
            }}
          />
          {hasOptions(type) ? (
            <div className="flex flex-col gap-1">
              <Text size="xs" className="text-text-secondary">
                Options
              </Text>
              {options.map((option, index) => (
                <div key={option.id ?? `new-${index}`} className="flex items-center gap-1">
                  <TextInput
                    size="xs"
                    className="flex-1"
                    value={option.name}
                    aria-label={`Option ${index + 1}`}
                    onChange={(e) => {
                      const next = e.currentTarget.value;
                      setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, name: next } : o)));
                    }}
                  />
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label={`Remove option ${option.name}`}
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <TextInput
                  size="xs"
                  className="flex-1"
                  placeholder="Add an option"
                  value={newOption}
                  aria-label="New option"
                  onChange={(e) => setNewOption(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                />
                <ActionIcon size="sm" variant="subtle" aria-label="Add option" onClick={addOption}>
                  <IconPlus size={14} />
                </ActionIcon>
              </div>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between gap-2">
            {property && !isTitle && onRemove ? (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                loading={saving}
                onClick={() => void remove()}
              >
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button size="xs" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
              {property ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
