export function getYouTubeId(value: string): string | null {
  if (!value) return null;

  const patterns = [
    /youtu\.be\/([^?#]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  if (/^[\w-]{11}$/.test(value)) return value;

  if (import.meta.env.DEV) {
    console.warn(`Invalid YouTube ID or URL: ${value}`);
  }
  return null;
}
