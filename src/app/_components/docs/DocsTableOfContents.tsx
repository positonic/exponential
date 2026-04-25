"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Heading } from "~/lib/docs/types";

interface DocsTableOfContentsProps {
  headings: Heading[];
}

export function DocsTableOfContents({ headings }: DocsTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        rootMargin: "-80px 0px -80% 0px",
        threshold: 0,
      }
    );

    // Observe all heading elements
    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className="w-56 shrink-0 border-l border-border-primary bg-background-primary">
      <div className={`sticky ${isLoggedIn ? "top-0 p-4" : "top-16 pt-10 px-4 pb-4"}`}>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          On this page
        </h4>
        <ul className="space-y-2">
          {headings.map((heading) => (
            <li
              key={heading.id}
              style={{ paddingLeft: heading.level === 3 ? "0.75rem" : 0 }}
            >
              <a
                href={`#${heading.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const element = document.getElementById(heading.id);
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth" });
                    setActiveId(heading.id);
                  }
                }}
                className={`block text-sm transition-colors duration-200 ${
                  activeId === heading.id
                    ? "font-medium text-blue-500"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
