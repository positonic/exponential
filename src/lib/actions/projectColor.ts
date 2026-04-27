export const PROJECT_PALETTE_SIZE = 10;

export function projectColorIndexFor(
  projectId: string | null | undefined,
): number {
  if (!projectId) return 4;
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PROJECT_PALETTE_SIZE;
}
