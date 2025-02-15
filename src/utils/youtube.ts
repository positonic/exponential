export function extractYoutubeSlugFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    let videoId: string | null = parsedUrl.searchParams.get('v');
    
    if (!videoId) {
      const matches = url.match(/youtu\.be\/([^?&]+)/);
      videoId = matches?.[1] ?? null;
    }

    if (!videoId) {
      throw new Error('Could not extract video ID from URL. Please provide a valid YouTube URL.');
    }

    return videoId;
  } catch (error) {
    throw new Error('Invalid URL provided. Please provide a valid YouTube URL.');
  }
} 