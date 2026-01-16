"use client";

import { Modal, Stack, Group, Text, Kbd, Title } from "@mantine/core";
import { IconKeyboard } from "@tabler/icons-react";

interface KeyboardShortcutsHelpProps {
  opened: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ["j"], altKeys: ["->"], description: "Next project" },
  { keys: ["k"], altKeys: ["<-"], description: "Previous project" },
  { keys: ["s"], description: "Skip project" },
  { keys: ["n"], description: "Focus next action input" },
  { keys: ["Enter"], description: "Submit action (when focused)" },
  { keys: ["d"], description: "Mark project as reviewed" },
  { keys: ["?"], description: "Show this help" },
  { keys: ["Esc"], description: "Close help" },
];

export function KeyboardShortcutsHelp({
  opened,
  onClose,
}: KeyboardShortcutsHelpProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconKeyboard size={20} />
          <Title order={4}>Keyboard Shortcuts</Title>
        </Group>
      }
      centered
      size="sm"
    >
      <Stack gap="sm">
        {shortcuts.map((shortcut, i) => (
          <Group key={i} justify="space-between">
            <Group gap="xs">
              {shortcut.keys.map((key, j) => (
                <Kbd key={j} size="sm">
                  {key}
                </Kbd>
              ))}
              {shortcut.altKeys && (
                <>
                  <Text span size="xs" c="dimmed">
                    or
                  </Text>
                  {shortcut.altKeys.map((key, j) => (
                    <Kbd key={`alt-${j}`} size="sm">
                      {key}
                    </Kbd>
                  ))}
                </>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {shortcut.description}
            </Text>
          </Group>
        ))}
      </Stack>
    </Modal>
  );
}
