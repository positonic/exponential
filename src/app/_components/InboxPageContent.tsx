"use client";

import { Title, Text } from "@mantine/core";
import { DocsHelpLink } from "~/app/_components/docs/DocsHelpLink";
import { Actions } from "./Actions";

export function InboxPageContent() {
  return (
    <>
      {/* Page Header */}
      <div className="mb-6 w-full">
        <div>
          <div className="flex items-center gap-2">
            <Title order={2} size="h3" className="text-text-primary">
              Inbox
            </Title>
            <DocsHelpLink pathname="/inbox" />
          </div>
          <Text size="sm" c="dimmed" mt={4}>
            Actions without a date or project assigned
          </Text>
        </div>
      </div>

      {/* Actions List */}
      <Actions viewName="inbox" />
    </>
  );
}
