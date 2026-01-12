// Tag color options from the design system
export const TAG_COLORS = [
  'avatar-red',
  'avatar-teal',
  'avatar-blue',
  'avatar-green',
  'avatar-yellow',
  'avatar-plum',
  'avatar-mint',
  'avatar-lightYellow',
  'avatar-lightPurple',
  'avatar-lightBlue',
  'avatar-orange',
  'avatar-lightGreen',
  'avatar-lightRed',
  'avatar-skyBlue',
  'avatar-paleGreen',
  'avatar-paleYellow',
  'avatar-lavender',
  'avatar-powderBlue',
  'avatar-lightPink',
  'avatar-lightGray',
  'brand-primary',
  'brand-success',
  'brand-warning',
  'brand-error',
  'brand-info',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: TagColor;
  description: string | null;
  isSystem: boolean;
  workspaceId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionTag {
  id: string;
  actionId: string;
  tagId: string;
  createdAt: Date;
  tag: Tag;
}

// System tag slugs for reference
export const SYSTEM_TAG_SLUGS = [
  'bug',
  'agenda-item',
  'feature',
  'enhancement',
  'question',
  'documentation',
  'urgent',
  'blocked',
  'needs-review',
  'meeting-followup',
  'research',
  'idea',
] as const;

export type SystemTagSlug = (typeof SYSTEM_TAG_SLUGS)[number];
