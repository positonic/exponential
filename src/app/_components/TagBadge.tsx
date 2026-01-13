import { Badge, Tooltip } from '@mantine/core';
import { getTagMantineColor } from '~/utils/tagColors';

interface TagBadgeProps {
  tag: {
    id: string;
    name: string;
    slug: string;
    color: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  withTooltip?: boolean;
}

export function TagBadge({ tag, size = 'sm', withTooltip = false }: TagBadgeProps) {
  const badge = (
    <Badge
      size={size}
      variant="light"
      color={getTagMantineColor(tag.color)}
    >
      {tag.name}
    </Badge>
  );

  if (withTooltip) {
    return (
      <Tooltip label={tag.name}>
        {badge}
      </Tooltip>
    );
  }

  return badge;
}

interface TagBadgeListProps {
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
  }>;
  maxDisplay?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function TagBadgeList({ tags, maxDisplay = 3, size = 'sm' }: TagBadgeListProps) {
  if (!tags || tags.length === 0) return null;

  const displayTags = tags.slice(0, maxDisplay);
  const overflowCount = tags.length - maxDisplay;

  return (
    <>
      {displayTags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} size={size} />
      ))}
      {overflowCount > 0 && (
        <Tooltip
          label={tags.slice(maxDisplay).map(t => t.name).join(', ')}
          multiline
          w={200}
        >
          <Badge size={size} variant="light" color="gray">
            +{overflowCount}
          </Badge>
        </Tooltip>
      )}
    </>
  );
}
