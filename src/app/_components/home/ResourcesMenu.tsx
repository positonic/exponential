"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconBook } from "@tabler/icons-react";

export function ResourcesMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Trigger */}
      <button
        className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
        onClick={() => setIsOpen(!isOpen)}
      >
        Resources
        <IconChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Invisible bridge to prevent menu from closing */}
          <div className="absolute top-full left-0 h-4 w-full" />

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-[320px] bg-background-elevated border border-border-primary rounded-xl shadow-2xl overflow-hidden z-50">
            <div className="p-4">
              <Link
                href="/docs"
                className="group flex items-start gap-4 hover:bg-surface-hover rounded-lg p-3 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-indigo/10 flex items-center justify-center flex-shrink-0">
                  <IconBook
                    size={20}
                    className="text-accent-indigo"
                    stroke={1.5}
                  />
                </div>
                <div>
                  <p className="font-semibold text-text-primary group-hover:text-accent-indigo transition-colors">
                    Knowledge Base
                  </p>
                  <p className="text-sm text-text-muted leading-snug mt-1">
                    Step-by-step tutorials, FAQs, and documentation to help you
                    get the most out of Exponential
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
