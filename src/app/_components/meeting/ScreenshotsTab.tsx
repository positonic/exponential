"use client";

import { IconExternalLink } from "@tabler/icons-react";

interface ScreenshotItem {
  id: string;
  url: string;
  timestamp: string | null;
}

interface ScreenshotsTabProps {
  screenshots: ScreenshotItem[];
  videoUrl: string | null;
}

export function ScreenshotsTab({ screenshots, videoUrl }: ScreenshotsTabProps) {
  if (screenshots.length === 0) {
    return <div className="mp-empty">No screenshots captured for this meeting.</div>;
  }

  return (
    <div>
      <div className="mp-shots-head">
        <div className="mp-sec" style={{ margin: 0, flex: 1 }}>
          <h3>Auto-captured frames</h3>
          <span className="mp-sec__count">{screenshots.length}</span>
          <span className="mp-sec__rule" />
        </div>
        {videoUrl && (
          <a
            className="mp-chipbtn"
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconExternalLink size={11} /> Open recording
          </a>
        )}
      </div>
      <div className="mp-shots">
        {screenshots.map((shot) => (
          <figure key={shot.id} className="mp-shot" style={{ margin: 0 }}>
            <div className="mp-shot__frame">
              {shot.timestamp && <span className="mp-shot__time">{shot.timestamp}</span>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="mp-shot__img"
                src={shot.url}
                alt={`Screen capture${shot.timestamp ? ` at ${shot.timestamp}` : ""}`}
                onClick={() => window.open(shot.url, "_blank")}
              />
            </div>
            {shot.timestamp && <figcaption className="mp-shot__cap">{shot.timestamp}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
}
