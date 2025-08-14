/**
 * Utility functions for generating consistent avatar colors and initials
 */

import { colorTokens } from "~/styles/colors";

// Get avatar colors from design system
const AVATAR_COLORS = [
  colorTokens.light.avatar.red,
  colorTokens.light.avatar.teal,
  colorTokens.light.avatar.blue,
  colorTokens.light.avatar.green,
  colorTokens.light.avatar.yellow,
  colorTokens.light.avatar.plum,
  colorTokens.light.avatar.mint,
  colorTokens.light.avatar.lightYellow,
  colorTokens.light.avatar.lightPurple,
  colorTokens.light.avatar.lightBlue,
  colorTokens.light.avatar.orange,
  colorTokens.light.avatar.lightGreen,
  colorTokens.light.avatar.lightRed,
  colorTokens.light.avatar.skyBlue,
  colorTokens.light.avatar.paleGreen,
  colorTokens.light.avatar.paleYellow,
  colorTokens.light.avatar.lavender,
  colorTokens.light.avatar.powderBlue,
  colorTokens.light.avatar.lightPink,
  colorTokens.light.avatar.lightGray,
];

/**
 * Generates a consistent color based on a string input
 * Same string will always return the same color
 */
export function getAvatarColor(input: string): string {
  if (!input) return AVATAR_COLORS[0] as string;
  
  // Create a simple hash of the string
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use the hash to select a color
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] as string;
}

/**
 * Gets the initial character from a name or email
 */
export function getInitial(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    return name.trim().charAt(0).toUpperCase();
  }
  
  if (email && email.trim()) {
    return email.trim().charAt(0).toUpperCase();
  }
  
  return '?';
}

/**
 * Gets a unique identifier for color generation
 * Prefers name, falls back to email
 */
export function getColorSeed(name?: string | null, email?: string | null): string {
  return (name?.trim() || email?.trim() || 'anonymous').toLowerCase();
}

/**
 * Determines if a color is light or dark to choose appropriate text color
 */
export function getTextColor(backgroundColor: string): string {
  // Remove # if present
  const hex = backgroundColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return semantic colors from design system
  return luminance > 0.5 ? colorTokens.light.text.primary : colorTokens.light.text.inverse;
}