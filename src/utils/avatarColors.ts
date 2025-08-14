/**
 * Utility functions for generating consistent avatar colors and initials
 */

// Predefined set of nice colors that work well for avatars
const AVATAR_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Light Yellow
  '#BB8FCE', // Light Purple
  '#85C1E9', // Light Blue
  '#F8C471', // Orange
  '#82E0AA', // Light Green
  '#F1948A', // Light Red
  '#85D2F0', // Sky Blue
  '#A9DFBF', // Pale Green
  '#F9E79F', // Pale Yellow
  '#D2B4DE', // Lavender
  '#AED6F1', // Powder Blue
  '#FADBD8', // Light Pink
  '#D5DBDB', // Light Gray
];

/**
 * Generates a consistent color based on a string input
 * Same string will always return the same color
 */
export function getAvatarColor(input: string): string {
  if (!input) return AVATAR_COLORS[0];
  
  // Create a simple hash of the string
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use the hash to select a color
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
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
  
  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}