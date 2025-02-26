export interface Caption {
  startTime: string;
  endTime: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export function parseVTT(vttContent: string): Caption[] {
  // Strip off leading/trailing quotes if they exist
  const cleanedContent = vttContent.startsWith('"') && vttContent.endsWith('"')
    ? vttContent.slice(1, -1)
    : vttContent;

  // Remove WEBVTT header and split into chunks
  const chunks = cleanedContent
    .replace('WEBVTT\n\n', '')
    .trim()
    .split('\n\n');

  const captions: Caption[] = [];
    
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    
    if (lines.length < 2) continue;

    const timeMatch = lines[0]?.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!timeMatch || timeMatch.length < 3) continue;

    const startTime = timeMatch[1]!;
    const endTime = timeMatch[2]!;
    const text = lines.slice(1).join(' ');
    
    captions.push({
      startTime,
      endTime,
      text,
      startSeconds: timeToSeconds(startTime),
      endSeconds: timeToSeconds(endTime)
    });
  }

  return captions;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = parts;
  return hours * 3600 + minutes * 60 + parseFloat(seconds.toString());
}

// Helper function to format seconds back to timestamp if needed
export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(3);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(6, '0')}`;
} 