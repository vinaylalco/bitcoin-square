export default function VideoGhost() {
  return (
    <div
      className="relative w-full overflow-hidden rounded aspect-video bg-neutral-200 dark:bg-neutral-700 animate-pulse"
      aria-hidden
    >
      <svg
        className="absolute inset-0 m-auto h-12 w-12 text-neutral-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}
