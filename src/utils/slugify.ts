export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '_')     // Replace spaces with _
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '_')   // Replace multiple - with single _
    .trim();                   // Trim - from start and end
} 