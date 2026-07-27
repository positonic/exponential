import type { CommentAuthor } from "./CommentThread";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

export interface ActivityReply {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  author: CommentAuthor;
}

export interface ActivityComment {
  type: "comment";
  id: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  author: CommentAuthor;
}

export interface ActivityUpdate {
  type: "update";
  id: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt?: Date;
  author: CommentAuthor;
  replies: ActivityReply[];
}

/** A status transition rendered as two colored dots + labels. Colors are
 *  Mantine color names resolved by the entity-aware hook (status vocabularies
 *  differ per entity), keeping the feed itself entity-agnostic. */
export interface ActivityStatusChange {
  fromLabel: string;
  fromColor: string;
  toLabel: string;
  toColor: string;
}

/** A compact audit-event row (created / status change / field updates) in the
 *  unified timeline. Typographically subordinate to comments: one muted line,
 *  no card, no avatar. The hook pre-builds the verb phrase so the feed stays
 *  entity-agnostic. */
export interface ActivityEventItem {
  type: "event";
  id: string;
  createdAt: Date;
  actorName: string;
  /** Verb phrase after the actor name, e.g. "updated priority and effort". */
  text: string;
  statusChange?: ActivityStatusChange;
  /** True when the change came from a bulk operation. */
  bulk?: boolean;
}

export type ActivityItem = ActivityComment | ActivityUpdate | ActivityEventItem;

/** Timeline filter: everything, authored content only, or audit events only. */
export type ActivityFilter = "all" | "comments" | "changes";

export interface StatusOption {
  key: string;
  label: string;
  color: string;
  mantineColor: string;
  icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
}

export interface UseActivityReturn {
  items: ActivityItem[];
  count: number;
  isLoading: boolean;

  addComment: (content: string) => Promise<void>;
  deleteComment: (id: string) => void;
  editComment: (id: string, content: string) => Promise<void>;

  addUpdate?: (content: string, status: string) => Promise<void>;
  deleteUpdate?: (id: string) => void;

  addReply?: (updateId: string, content: string) => Promise<void>;
  deleteReply?: (id: string) => void;
  editReply?: (id: string, content: string) => Promise<void>;

  deleteImage?: (commentId: string, imageUrl: string) => void;

  statusOptions?: StatusOption[];
  defaultStatus?: string;

  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
  entityId?: string;

  invalidate: () => void;
}
