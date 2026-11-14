"use client";

import { Card, SegmentedControl, Skeleton, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

type SignUpMode = "open" | "invite-only";

const DESCRIPTIONS: Record<SignUpMode, string> = {
  open: "Anyone who can sign in can create an account.",
  "invite-only":
    "Only people with a pending workspace or team invitation can create an account. Existing users sign in as before.",
};

/**
 * The install's **Sign-up mode** (ADR-0081). Claiming a self-host install sets
 * invite-only; an instance admin can open it up again here. Takes effect on
 * the next sign-in attempt — the setting is read per request.
 */
export function SignUpModeCard() {
  const utils = api.useUtils();
  const { data, isLoading } = api.admin.getSignUpMode.useQuery();
  const setMode = api.admin.setSignUpMode.useMutation({
    onSuccess: (result) => {
      utils.admin.getSignUpMode.setData(undefined, result);
      notifications.show({
        title: "Sign-up updated",
        message: result.mode === "open" ? "Sign-up is open." : "Sign-up is invite-only.",
      });
    },
    onError: (error) => {
      notifications.show({ title: "Couldn't change sign-up", message: error.message, color: "red" });
    },
  });

  const mode = data?.mode;

  return (
    <Card className="border border-border-primary bg-surface-secondary">
      <Title order={4} className="text-text-primary">
        Sign-up
      </Title>
      <Text size="sm" className="mb-3 text-text-muted">
        Who can create an account on this install.
      </Text>
      {isLoading || !mode ? (
        <Skeleton height={36} width={240} />
      ) : (
        <>
          <SegmentedControl
            aria-label="Sign-up mode"
            value={mode}
            disabled={setMode.isPending}
            onChange={(value) => setMode.mutate({ mode: value as SignUpMode })}
            data={[
              { value: "open", label: "Open" },
              { value: "invite-only", label: "Invite-only" },
            ]}
          />
          <Text size="sm" className="mt-2 text-text-secondary">
            {DESCRIPTIONS[mode]}
          </Text>
        </>
      )}
    </Card>
  );
}
