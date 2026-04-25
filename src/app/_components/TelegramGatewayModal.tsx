"use client";

import { Modal, Group, Text } from "@mantine/core";
import { IconBrandTelegram } from "@tabler/icons-react";
import { TelegramGatewayCard } from "~/app/_components/TelegramGatewayCard";

interface TelegramGatewayModalProps {
  opened: boolean;
  onClose: () => void;
}

export function TelegramGatewayModal({
  opened,
  onClose,
}: TelegramGatewayModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <IconBrandTelegram size={24} className="text-brand-primary" />
          <Text fw={600}>Telegram Connection</Text>
        </Group>
      }
      size="md"
    >
      <TelegramGatewayCard embedded assistantSaved />
    </Modal>
  );
}
