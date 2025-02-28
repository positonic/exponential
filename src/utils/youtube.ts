/**
 * Extracts YouTube video ID from various URL formats.
 * 
 * Supported URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * - @https://www.youtube.com/live/VIDEO_ID
 * 
 * @throws {Error} If video ID cannot be extracted from the URL
 * @param url YouTube URL string
 * @returns Video ID extracted from the URL
 */
export function getVideoIdFromYoutubeUrl(url: string): string {
  if (!url) {
    throw new Error('URL is required');
  }

  // Remove leading "@" and trim whitespace
  url = url.replace(/^@/, '').trim();

  try {
    // First try using URL parsing for watch?v= format
    const parsedUrl = new URL(url);
    const videoId = parsedUrl.searchParams.get('v');
    
    if (videoId && /^[\w-]{11}$/.test(videoId)) {
      return videoId;
    }

    // If not found, try other patterns
    const patterns = [
      /youtu\.be\/([^#&?]{11})/, // youtu.be URLs
      /youtube\.com\/embed\/([^#&?]{11})/, // embed URLs
      /youtube\.com\/v\/([^#&?]{11})/, // v/ URLs
      /youtube\.com\/shorts\/([^#&?]{11})/, // shorts URLs
      /youtube\.com\/live\/([^#&?]{11})/ // live URLs
    ];

    for (const pattern of patterns) {
      const matches = url.match(pattern);
      if (matches?.[1]) {
        return matches[1];
      }
    }

    throw new Error('Could not extract video ID from URL. Please provide a valid YouTube URL.');
  } catch (error) {
    console.error('Error extracting video ID from URL:', error);
    throw new Error('Invalid URL provided. Please provide a valid YouTube URL.');
  }
} 