interface SyncRecord {
  provider: string;
  status: string;
  externalId?: string | null;
  syncedAt?: Date | string | null;
}

interface ActionWithMaybeSyncs {
  syncs?: SyncRecord[] | null;
}

export interface SyncStatus {
  status: string;
  provider: string | null;
  externalId?: string | null;
  syncedAt?: Date | string | null;
}

export function getSyncStatus(action: ActionWithMaybeSyncs): SyncStatus {
  if (!action.syncs || action.syncs.length === 0) {
    return { status: "not_synced", provider: null };
  }

  const notionSync = action.syncs.find((sync) => sync.provider === "notion");
  if (notionSync) {
    return {
      status: notionSync.status,
      provider: "notion",
      externalId: notionSync.externalId,
      syncedAt: notionSync.syncedAt,
    };
  }

  const otherSync = action.syncs[0];
  if (otherSync) {
    return {
      status: otherSync.status,
      provider: otherSync.provider,
      externalId: otherSync.externalId,
      syncedAt: otherSync.syncedAt,
    };
  }

  return { status: "not_synced", provider: null };
}
