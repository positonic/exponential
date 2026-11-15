import { useCallback, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useWorkspaceNavLayout } from "~/hooks/useWorkspaceNavLayout";
import {
  BUILT_IN_NAV_ITEM_IDS,
  NAV_ITEM_CONFIG,
  NAV_PRESETS,
  applyNavVisibility,
  parseNavLayout,
  visibleNavItemIds,
  type NavUseCase,
} from "~/lib/navLayout";

export interface MenuFeature {
  id: string;
  label: string;
  description: string;
  isOn: boolean;
}

export type MenuSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * One save chain for the whole tab. Every save sends the full set of visible
 * items, so saves must land in the order the person made them or an earlier
 * click could overwrite a later one.
 */
let saveChain: Promise<unknown> = Promise.resolve();

/**
 * The built-in sidebar items as a list of on/off features, for the menu
 * picker.
 *
 * Reads what the sidebar shows in the current workspace and saves every change
 * straight away through `navigationPreference.setVisibleItems`, which applies
 * it everywhere the person has a layout. The sidebar's own queries are
 * updated first, so the real menu changes under the person's eyes as they
 * choose; a failed save puts both back.
 *
 * Items behind a plugin the current workspace has not switched on (Products,
 * Metrics) are not offered. Switching another item leaves their saved state
 * as it was; only choosing a use case, which sets the whole menu, changes it.
 */
export function useMenuFeatures() {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const { layout, isLoading: isLayoutLoading } = useWorkspaceNavLayout(workspaceId);
  const { data: enabledPlugins, isLoading: isPluginsLoading } =
    api.pluginConfig.getEnabled.useQuery(
      { workspaceId: workspaceId ?? undefined },
      { enabled: !!workspaceId, staleTime: 5 * 60 * 1000 },
    );

  // What the person has just chosen, held only while it is being saved. It
  // wins over the server's copy so a refetch landing mid-edit cannot flick a
  // switch back. Once the last save and the refetch behind it have landed it
  // is let go, and the switches follow the real layout again: the sidebar's
  // customiser can be opened beside this page and change that layout, and a
  // draft kept any longer would both hide those edits and overwrite them on
  // the next switch, since every save sends the whole menu.
  const [draft, setDraft] = useState<string[] | null>(null);
  const [status, setStatus] = useState<MenuSaveStatus>("idle");
  const pendingRef = useRef(0);
  const commitSeqRef = useRef(0);

  const isLoading = isLayoutLoading || (!!workspaceId && isPluginsLoading);
  const visibleIds = draft ?? visibleNavItemIds(layout);
  const visible = new Set(visibleIds);

  const isOffered = (id: string): boolean => {
    const plugin = NAV_ITEM_CONFIG[id]?.requiresPlugin;
    return !plugin || (enabledPlugins?.includes(plugin) ?? false);
  };

  const features: MenuFeature[] = BUILT_IN_NAV_ITEM_IDS.filter(isOffered).map((id) => ({
    id,
    label: NAV_ITEM_CONFIG[id]?.label ?? id,
    description: NAV_ITEM_CONFIG[id]?.description ?? "",
    isOn: visible.has(id),
  }));

  const save = api.navigationPreference.setVisibleItems.useMutation();

  const commit = useCallback(
    (next: string[]) => {
      if (isLoading) return;
      setDraft(next);
      setStatus("saving");

      // The sidebar reads these two queries; writing them now is what makes
      // it follow each choice without waiting for the round trip.
      void utils.navigationPreference.getPreferences.cancel();
      utils.navigationPreference.getPreferences.setData(undefined, (old) =>
        old
          ? { ...old, navLayout: applyNavVisibility(parseNavLayout(old.navLayout), next) }
          : old,
      );
      if (workspaceId) {
        void utils.navigationPreference.getWorkspaceLayout.cancel({ workspaceId });
        utils.navigationPreference.getWorkspaceLayout.setData({ workspaceId }, (old) =>
          old?.navLayout != null
            ? { navLayout: applyNavVisibility(parseNavLayout(old.navLayout), next) }
            : old,
        );
      }

      const seq = ++commitSeqRef.current;
      pendingRef.current += 1;
      saveChain = saveChain
        .then(() => save.mutateAsync({ visibleItemIds: next }))
        .then(
          () => true,
          () => false,
        )
        .then((saved) => {
          pendingRef.current -= 1;
          // A later choice is queued behind this one and carries the whole
          // menu, so its outcome is the one that counts.
          if (pendingRef.current > 0) return;
          setStatus(saved ? "saved" : "error");
          if (!saved) {
            notifications.show({
              title: "Menu not saved",
              message: "Your last change could not be saved and has been undone. Please try again.",
              color: "red",
            });
          }
          // Not awaited here: the next save must not queue behind a refetch.
          void (async () => {
            // Bring back what the server now holds (after a failure, that is
            // what undoes the change in the sidebar) and only then let go of
            // the draft, unless a newer choice has taken it over meanwhile.
            await utils.navigationPreference.invalidate().catch(() => undefined);
            if (commitSeqRef.current === seq) setDraft(null);
          })();
        });
    },
    [isLoading, save, utils, workspaceId],
  );

  /** Switch one feature on or off. */
  const setFeature = (id: string, isOn: boolean) => {
    const next = new Set(visibleIds);
    if (isOn) next.add(id);
    else next.delete(id);
    commit([...next]);
  };

  /**
   * Start from a use case's preset. Unlike a single switch this replaces the
   * whole set, including items this workspace does not offer: "my own to-do
   * list" should not leave Products showing in another workspace.
   */
  const applyUseCase = (useCase: NavUseCase) => {
    commit([...NAV_PRESETS[useCase]]);
  };

  /** The features a use case switches on, as offered in this workspace. */
  const presetLabels = (useCase: NavUseCase): string[] =>
    NAV_PRESETS[useCase].filter(isOffered).map((id) => NAV_ITEM_CONFIG[id]?.label ?? id);

  return {
    features,
    onCount: features.filter((f) => f.isOn).length,
    isLoading,
    status,
    setFeature,
    applyUseCase,
    presetLabels,
  };
}
