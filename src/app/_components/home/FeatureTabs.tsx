"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface FeatureTab {
  id: string;
  label: string;
  panel: ReactNode;
}

interface FeatureTabsProps {
  tabs: FeatureTab[];
  /** Names the tab list for assistive technology. */
  label: string;
}

/**
 * The tab switcher for the home page's feature section. Every panel is in
 * the page from the first render (the inactive ones are `hidden`), so the
 * copy is there for search engines and for readers without JavaScript-driven
 * state. Arrow keys, Home and End move between tabs, as the tabs pattern
 * expects.
 */
export function FeatureTabs({ tabs, label }: FeatureTabsProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;

    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    setActiveId(target.id);
    buttons.current[target.id]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="mkt-tablist mb-12 md:mb-16"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                buttons.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`feature-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`feature-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              className="mkt-tab"
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`feature-panel-${tab.id}`}
          aria-labelledby={`feature-tab-${tab.id}`}
          hidden={tab.id !== activeId}
          className="mkt-tabpanel"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
