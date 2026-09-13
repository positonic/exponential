import { useRef } from "react";
import { api } from "~/trpc/react";
import type { PastedScreenshot } from "~/app/_components/ActionModalForm";

/**
 * The work that still has to happen *after* an action exists: pasted
 * screenshots, which are blobs uploaded against the new action's id. Tags,
 * assignees and sprint membership used to be here too; they now travel in
 * the `action.create` request itself (`buildCreateActionPayload`) and the
 * server writes them in the same transaction as the Action.
 */
export interface ActionAttachments {
  screenshots: PastedScreenshot[];
}

/**
 * Carries a create-action form's screenshot uploads from submit to `onSuccess`.
 *
 * Both create-action modals reset their form the moment the user submits, so
 * the modal can close without waiting for the server. That rules out reading
 * these values off state in `onSuccess`: react-query rebinds a pending
 * mutation's options on every re-render (`MutationObserver.setOptions`), so
 * the callback runs against the *cleared* form, silently dropping whatever was
 * pasted.
 *
 * A single shared ref doesn't work either. Closing on submit means the user can
 * compose and submit a second action while the first is still in flight, and
 * one slot would hand the first action's `onSuccess` the second submission's
 * screenshots. So each submission is filed against the exact `variables` object
 * passed to `mutate()`, which react-query hands back to `onSuccess` - a
 * WeakMap, so entries die with the variables object rather than accumulating.
 */
export function useActionAttachments() {
  const pendingRef = useRef(new WeakMap<object, ActionAttachments>());

  // Each upload reports its own failure. Nothing here gates the modal - it
  // closed on submit and the optimistic row is already on screen.
  const uploadImageMutation = api.action.uploadImage.useMutation({
    onError: (error) => {
      console.error("Screenshot upload failed:", error);
    },
  });

  const utils = api.useUtils();

  return {
    /**
     * Files this submission's screenshots against the object handed to
     * `mutate()`. Call it with the same object you pass as the mutation's
     * variables. A submission with no screenshots files nothing, so its
     * `apply` and `discard` are no-ops.
     */
    record(variables: object, attachments: ActionAttachments) {
      if (attachments.screenshots.length === 0) return;
      pendingRef.current.set(variables, attachments);
    },

    /** Drops a submission that will never reach `onSuccess`. */
    discard(variables: object) {
      pendingRef.current.delete(variables);
    },

    /**
     * Uploads the screenshots filed for `variables` against the created
     * action. Fire-and-forget: returns immediately, having started every
     * upload.
     */
    apply(variables: object, actionId: string) {
      const pending = pendingRef.current.get(variables);
      pendingRef.current.delete(variables);
      if (!pending) return;

      const uploads = pending.screenshots.map((screenshot) =>
        uploadImageMutation.mutateAsync({
          actionId,
          base64Data: screenshot.base64,
        }),
      );

      // EditActionModal reads screenshots off the cached action, so it needs
      // a refetch once the uploads land.
      void Promise.allSettled(uploads).then(() =>
        utils.action.getAll.invalidate(),
      );
    },
  };
}
