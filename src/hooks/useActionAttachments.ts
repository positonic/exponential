import { useRef } from "react";
import { api } from "~/trpc/react";
import type { PastedScreenshot } from "~/app/_components/ActionModalForm";

/**
 * The work that has to happen *after* an action exists, because each piece
 * needs the new action's id: sprint membership, assignees, tags, and pasted
 * screenshots.
 */
export interface ActionAttachments {
  sprintListId: string | null;
  assigneeIds: string[];
  tagIds: string[];
  screenshots: PastedScreenshot[];
}

/**
 * Carries a create-action form's post-create work from submit to `onSuccess`.
 *
 * Both create-action modals reset their form the moment the user submits, so
 * the modal can close without waiting for the server. That rules out reading
 * these values off state in `onSuccess`: react-query rebinds a pending
 * mutation's options on every re-render (`MutationObserver.setOptions`), so
 * the callback runs against the *cleared* form, silently dropping whatever was
 * selected.
 *
 * A single shared ref doesn't work either. Closing on submit means the user can
 * compose and submit a second action while the first is still in flight, and
 * one slot would hand the first action's `onSuccess` the second submission's
 * selections. So each submission is filed against the exact `variables` object
 * passed to `mutate()`, which react-query hands back to `onSuccess` - a
 * WeakMap, so entries die with the variables object rather than accumulating.
 *
 * This lives in one place because it didn't used to: the two modals kept their
 * own copies, they drifted, and only one of them ever applied tags.
 */
export function useActionAttachments() {
  const pendingRef = useRef(new WeakMap<object, ActionAttachments>());

  // Each mutation reports its own failure. Nothing here gates the modal - it
  // closed on submit and the optimistic row is already on screen.
  const addToListMutation = api.list.addAction.useMutation({
    onError: (error) => {
      console.error("Sprint assignment failed:", error);
    },
  });
  const assignMutation = api.action.assign.useMutation({
    onError: (error) => {
      console.error("Assignment failed:", error);
    },
  });
  const setTagsMutation = api.tag.setActionTags.useMutation({
    onError: (error) => {
      console.error("Setting tags failed:", error);
    },
  });
  const uploadImageMutation = api.action.uploadImage.useMutation({
    onError: (error) => {
      console.error("Screenshot upload failed:", error);
    },
  });

  const utils = api.useUtils();

  return {
    /**
     * Files this submission's attachments against the object handed to
     * `mutate()`. Call it with the same object you pass as the mutation's
     * variables.
     */
    record(variables: object, attachments: ActionAttachments) {
      pendingRef.current.set(variables, attachments);
    },

    /** Drops a submission that will never reach `onSuccess`. */
    discard(variables: object) {
      pendingRef.current.delete(variables);
    },

    /**
     * Applies the attachments filed for `variables` to the created action.
     * Fire-and-forget: returns immediately, having started every call.
     */
    apply(variables: object, actionId: string) {
      const pending = pendingRef.current.get(variables);
      pendingRef.current.delete(variables);
      if (!pending) return;

      const promises: Promise<unknown>[] = [];

      if (pending.sprintListId) {
        promises.push(
          addToListMutation.mutateAsync({
            listId: pending.sprintListId,
            actionId,
          }),
        );
      }

      if (pending.assigneeIds.length > 0) {
        promises.push(
          assignMutation.mutateAsync({ actionId, userIds: pending.assigneeIds }),
        );
      }

      if (pending.tagIds.length > 0) {
        promises.push(
          setTagsMutation.mutateAsync({ actionId, tagIds: pending.tagIds }),
        );
      }

      for (const screenshot of pending.screenshots) {
        promises.push(
          uploadImageMutation.mutateAsync({
            actionId,
            base64Data: screenshot.base64,
          }),
        );
      }

      if (pending.screenshots.length > 0) {
        // EditActionModal reads screenshots off the cached action, so it needs
        // a refetch once the uploads land.
        void Promise.allSettled(promises).then(() =>
          utils.action.getAll.invalidate(),
        );
        return;
      }

      void Promise.allSettled(promises);
    },
  };
}
