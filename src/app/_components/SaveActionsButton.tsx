import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { api } from "~/trpc/react";
import { TranscriptionDraftActionsModal } from "./TranscriptionDraftActionsModal";

interface SaveActionsButtonProps {
  transcriptionId: string;
  actionsSavedAt?: Date | string | null;
}

export default function SaveActionsButton({
  transcriptionId,
  actionsSavedAt,
}: SaveActionsButtonProps) {
  const [draftsOpened, setDraftsOpened] = useState(false);
  const utils = api.useUtils();
  const generateDraftsMutation =
    api.transcription.generateDraftActions.useMutation({
      onSuccess: (result) => {
        if (result.alreadyPublished) {
          notifications.show({
            title: "Actions Already Created",
            message: "This transcription already has actions.",
            color: "orange",
          });
          return;
        }

        if (result.actionsCreated === 0 && result.draftCount === 0) {
          notifications.show({
            title: "No Actions Found",
            message: "No action items were detected in this transcription.",
            color: "gray",
          });
          return;
        }

        notifications.show({
          title: "Draft Actions Ready",
          message: "Review and edit the draft actions before creating them.",
          color: "green",
        });

        void utils.transcription.getById.invalidate({ id: transcriptionId });
        setDraftsOpened(true);
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to generate draft actions",
          color: "red",
        });
      },
    });

  const handleOpenDrafts = () => {
    if (actionsSavedAt) {
      setDraftsOpened(true);
      return;
    }

    generateDraftsMutation.mutate({ transcriptionId });
  };

  return (
    <>
      <Button
        onClick={handleOpenDrafts}
        loading={generateDraftsMutation.isPending}
      >
        {actionsSavedAt ? "Review Actions" : "Save Actions"}
      </Button>
      <TranscriptionDraftActionsModal
        opened={draftsOpened}
        onClose={() => setDraftsOpened(false)}
        transcriptionId={transcriptionId}
      />
    </>
  );
}
