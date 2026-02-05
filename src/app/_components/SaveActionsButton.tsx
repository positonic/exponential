import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface SaveActionsButtonProps {
  transcriptionId: string;
  actionsSavedAt?: Date | string | null;
}

export default function SaveActionsButton({
  transcriptionId,
  actionsSavedAt,
}: SaveActionsButtonProps) {
  const utils = api.useUtils();
  const saveActionsMutation =
    api.transcription.saveActionsFromTranscription.useMutation({
      onSuccess: (result) => {
        if (result.alreadySaved) {
          notifications.show({
            title: "Already Saved",
            message: "Actions have already been saved for this transcription.",
            color: "orange",
          });
          return;
        }

        notifications.show({
          title: "Saved",
          message: "Actions saved successfully.",
          color: "green",
        });

        void utils.transcription.getById.invalidate({ id: transcriptionId });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to save actions",
          color: "red",
        });
      },
    });

  const isSaved = Boolean(actionsSavedAt);

  return (
    <Button
      onClick={() => saveActionsMutation.mutate({ transcriptionId })}
      loading={saveActionsMutation.isPending}
      disabled={isSaved}
      title={isSaved ? "Actions already saved for this transcription" : undefined}
    >
      {isSaved ? "Actions Saved" : "Save Actions"}
    </Button>
  );
}
