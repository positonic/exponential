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

export type ActivityItem = ActivityComment | ActivityUpdate;

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
