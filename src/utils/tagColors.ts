// Maps tag.color semantic keys to Mantine color names
export const TAG_COLOR_MAP: Record<string, string> = {
  'avatar-red': 'red',
  'avatar-teal': 'teal',
  'avatar-blue': 'blue',
  'avatar-green': 'green',
  'avatar-yellow': 'yellow',
  'avatar-plum': 'grape',
  'avatar-mint': 'teal',
  'avatar-lightYellow': 'yellow',
  'avatar-lightBlue': 'cyan',
  'avatar-orange': 'orange',
  'avatar-lavender': 'violet',
  'avatar-lightPurple': 'violet',
  'avatar-lightGreen': 'green',
  'avatar-lightRed': 'red',
  'avatar-skyBlue': 'cyan',
  'avatar-paleGreen': 'green',
  'avatar-paleYellow': 'yellow',
  'avatar-powderBlue': 'blue',
  'avatar-lightPink': 'pink',
  'avatar-lightGray': 'gray',
  'brand-error': 'red',
  'brand-success': 'green',
  'brand-warning': 'yellow',
  'brand-primary': 'blue',
  'brand-info': 'cyan',
};

/**
 * Convert a semantic color key to a Mantine color name
 * @param colorKey - The semantic color key (e.g., "avatar-red", "brand-error")
 * @returns Mantine color name (e.g., "red", "blue")
 */
export function getTagMantineColor(colorKey: string): string {
  return TAG_COLOR_MAP[colorKey] ?? 'gray';
}
