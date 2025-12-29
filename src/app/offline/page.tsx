'use client';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-primary p-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="rounded-full bg-surface-secondary p-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">
          You&apos;re Offline
        </h1>
        <p className="text-text-secondary max-w-md">
          It looks like you&apos;ve lost your internet connection.
          Some features may be unavailable until you&apos;re back online.
        </p>
        <button
          onClick={handleRetry}
          className="mt-4 rounded-md bg-brand-primary px-6 py-3 font-medium text-white hover:bg-brand-primary-hover transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
