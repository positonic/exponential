export interface Video {
  id: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  videoUrl: string;
  transcription: string | null;
  status: string;
  slug: string | null;
  isSearchable: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
} 