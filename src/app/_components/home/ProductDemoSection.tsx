"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Container } from "@mantine/core";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Image from "next/image";

interface Slide {
  id: string;
  title: string;
  description: string;
  image?: string;
}

const SLIDES: Slide[] = [
  {
    id: "exponential-home",
    title: "Your AI-native execution OS",
    description:
      "A unified home for goals, projects, meetings, and actions — intelligently connected.",
    image: "/product-shots/exponential-home.jpg",
  },
  {
    id: "exponential-workspace-home",
    title: "Workspace command center",
    description:
      "Dedicated workspaces for teams, clients, or initiatives — each with focused visibility.",
    image: "/product-shots/exponential-workspace-home.jpg",
  },
  {
    id: "exponential-projects",
    title: "Projects with intelligence",
    description:
      "Track health, progress, ownership, and outcomes across every active initiative.",
    image: "/product-shots/exponential-projects.jpg",
  },
  {
    id: "exponential-project-action-page",
    title: "Project action hub",
    description:
      "Every action, owner, and dependency in one focused execution view.",
    image: "/product-shots/exponential-project-action-page.jpg",
  },
  {
    id: "exponential-projects-chat",
    title: "Chat inside projects",
    description:
      "Discuss work where it happens — with AI summarization and context linking.",
    image: "/product-shots/exponential-projects-chat.jpg",
  },
  {
    id: "exponential-meetings",
    title: "Meeting OS",
    description:
      "Prepare, capture, and execute meetings without losing context.",
    image: "/product-shots/exponential-meetings.jpg",
  },
  {
    id: "expo-auto-actions-from-meeting",
    title: "Turn meetings into actions automatically",
    description:
      "AI converts discussions into structured, assignable next steps in seconds.",
    image: "/product-shots/expo-auto-actions-from-meeting.jpg",
  },
  {
    id: "expo-meeting-auto-actions",
    title: "Automatic follow-ups",
    description:
      "Every decision becomes trackable, scheduled execution — nothing gets lost.",
    image: "/product-shots/expo-meeting auto-actions.jpg",
  },
  {
    id: "expo-discuss-meeting-notes",
    title: "Interrogate your meeting notes",
    description:
      "Summarize, extract decisions, surface risks, and generate actions instantly.",
    image: "/product-shots/expo-discuss-meeting-notes.jpg",
  },
  {
    id: "expo-meetings-discuss",
    title: "Search across conversations",
    description:
      "Connect meetings, decisions, and actions across projects and teams.",
    image: "/product-shots/expo-meetings-discuss.jpg",
  },
  {
    id: "expo-draft-actions",
    title: "AI-drafted next steps",
    description:
      "Generate clear, outcome-driven actions from context, goals, or chat.",
    image: "/product-shots/expo-draft-actions.jpg",
  },
  {
    id: "exponential-calendar-connect",
    title: "Connect your calendar",
    description:
      "Sync Google, Apple, or Outlook to unify planning and execution.",
    image: "/product-shots/exponential-calendar-connect.jpg",
  },
  {
    id: "exponential-calendar-multi",
    title: "Multiple calendars, one view",
    description:
      "Overlay personal, team, and project calendars in a single timeline.",
    image: "/product-shots/exponential-calendar-multi.jpg",
  },
  {
    id: "exponential-calendar-today",
    title: "Calendar meets execution",
    description:
      "See meetings, actions, and outcomes together in one streamlined view.",
    image: "/product-shots/exponential-calendar-today.jpg",
  },
  {
    id: "exponential-daily-plan",
    title: "Plan your day with AI",
    description:
      "Turn goals into a realistic, optimized daily schedule.",
    image: "/product-shots/exponential-daily-plan.jpg",
  },
  {
    id: "exponential-plan-day-schedule",
    title: "Drag, drop, rebalance",
    description:
      "Restructure your day dynamically with AI-aware scheduling.",
    image: "/product-shots/exponential-plan-day-schedule.jpg",
  },
  {
    id: "exponential-plan-time",
    title: "Own your time",
    description:
      "Understand where your time goes — and redirect it toward outcomes.",
    image: "/product-shots/exponential-plan-time.jpg",
  },
  {
    id: "exponential-schedule-tasks",
    title: "Schedule actions instantly",
    description:
      "Convert any action into a time-blocked commitment in one click.",
    image: "/product-shots/exponential-schedule-tasks.jpg",
  },
  {
    id: "exponential-today-calm",
    title: "A calm today view",
    description:
      "A distraction-free interface designed for clarity and focused execution.",
    image: "/product-shots/exponential-today-calm.jpg",
  },
  {
    id: "exponential-weekly-checkin",
    title: "Smart weekly check-ins",
    description:
      "AI-generated reflections that surface wins, blockers, and priorities.",
    image: "/product-shots/exponential-weekly-checkin.jpg",
  },
  {
    id: "exponential-weekly-team-review",
    title: "Weekly team alignment",
    description:
      "Run structured team reviews with metrics, accountability, and AI insight.",
    image: "/product-shots/exponential-weekly-team-review.jpg",
  },
  {
    id: "exponential-knowledge-base",
    title: "Conversational knowledge base",
    description:
      "Your documents and notes — searchable, contextual, and AI-powered.",
    image: "/product-shots/exponential-knowledge-base.jpg",
  },
  {
    id: "exponential-integrations",
    title: "Integrate your stack",
    description:
      "Connect Slack, WhatsApp, calendar, and more into one intelligent workflow.",
    image: "/product-shots/exponential-integrations.jpg",
  },
  {
    id: "expo-whatsapp-connect",
    title: "Capture from WhatsApp",
    description:
      "Send ideas, tasks, and voice notes directly into your workspace.",
    image: "/product-shots/expo-whatsapp-connect.jpg",
  },
  {
    id: "expo-whatsapp-qr",
    title: "Instant WhatsApp onboarding",
    description:
      "Scan a QR code and start sending tasks to your AI OS immediately.",
    image: "/product-shots/expo-whatsapp-qr.jpg",
  },
  {
    id: "expo-specialist-agents",
    title: "Specialist AI agents",
    description:
      "Deploy focused agents for planning, research, strategy, and execution.",
    image: "/product-shots/expo-specialist-agents.jpg",
  },
  {
    id: "exponential-os-ai-assistant",
    title: "Your embedded AI assistant",
    description:
      "An always-on assistant that understands your goals, projects, and context.",
    image: "/product-shots/exponential-OS AI Assistant.jpg",
  },
];

const SLIDE_ICONS: Record<string, string> = {
  today: "📋",
  goals: "🎯",
  projects: "📊",
  "ai-chat": "🤖",
  "weekly-review": "🔄",
  outcomes: "📈",
  journal: "📝",
  crm: "🤝",
  calendar: "📅",
  team: "👥",
};

const AUTO_CYCLE_MS = 6000;

function ChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12.5 15L7.5 10L12.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 15L12.5 10L7.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ProductDemoSectionProps {
  id?: string;
}

export function ProductDemoSection({ id }: ProductDemoSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const activeSlide = SLIDES[activeIndex]!;

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % SLIDES.length);
    }, AUTO_CYCLE_MS);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start/stop timer based on hover state
  useEffect(() => {
    if (isHovered) {
      stopTimer();
    } else {
      startTimer();
    }
    return stopTimer;
  }, [isHovered, startTimer, stopTimer]);

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(index);
      // Reset timer on manual navigation
      if (!isHovered) {
        startTimer();
      }
    },
    [isHovered, startTimer],
  );

  const goPrev = useCallback(() => {
    goTo((activeIndex - 1 + SLIDES.length) % SLIDES.length);
  }, [activeIndex, goTo]);

  const goNext = useCallback(() => {
    goTo((activeIndex + 1) % SLIDES.length);
  }, [activeIndex, goTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    },
    [goPrev, goNext],
  );

  const animationDuration = shouldReduceMotion ? 0 : 0.6;

  return (
    <section id={id} className="bg-surface-secondary py-20 md:py-28">
      <Container size="xl">
        <div className="text-center mb-12">
          <p className="text-text-muted uppercase tracking-wider text-sm font-medium mb-4">
            See it in action
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary">
            See what matters. Know where you stand. Move together.
          </h2>
        </div>

        {/* Browser Window */}
        <div
          className="relative rounded-xl overflow-hidden border border-border-primary shadow-2xl"
          role="region"
          aria-roledescription="carousel"
          aria-label="Product feature showcase"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {/* Browser Chrome */}
          <div className="bg-surface-tertiary px-4 py-3 flex items-center gap-2 border-b border-border-primary">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-brand-error/60" />
              <div className="w-3 h-3 rounded-full bg-brand-warning/60" />
              <div className="w-3 h-3 rounded-full bg-brand-success/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-surface-secondary px-4 py-1 rounded-md text-sm text-text-muted">
                exponential.im
              </div>
            </div>
          </div>

          {/* Slide Area */}
          <div
            className="relative aspect-[16/10] md:aspect-video bg-background-secondary"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Slides */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: animationDuration,
                  ease: "easeInOut",
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${activeIndex + 1} of ${SLIDES.length}: ${activeSlide.title}`}
                className="absolute inset-0"
              >
                {/* Image or Placeholder */}
                {activeSlide.image ? (
                  <Image
                    src={activeSlide.image}
                    alt={activeSlide.title}
                    fill
                    className="object-cover object-top"
                    priority={activeIndex === 0}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-background-secondary">
                    <div className="text-center">
                      <div
                        className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--color-accent-indigo) 15%, transparent)",
                        }}
                      >
                        <span className="text-3xl">
                          {SLIDE_ICONS[activeSlide.id] ?? "📱"}
                        </span>
                      </div>
                      <p className="text-text-muted text-sm">
                        {activeSlide.title}
                      </p>
                    </div>
                  </div>
                )}

                {/* Bottom Gradient Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(to top, var(--color-bg-primary) 0%, color-mix(in srgb, var(--color-bg-primary) 85%, transparent) 50%, transparent 100%)",
                    }}
                  />
                  <div className="relative z-10">
                    <h3 className="text-lg md:text-xl font-semibold bg-gradient-to-r from-accent-indigo to-accent-periwinkle bg-clip-text text-transparent mb-1.5">
                      {activeSlide.title}
                    </h3>
                    <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-2xl">
                      {activeSlide.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            <button
              onClick={goPrev}
              aria-label="Previous slide"
              className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background-overlay flex items-center justify-center text-text-inverse backdrop-blur-sm transition-opacity duration-200 hover:opacity-100 ${
                isHovered ? "opacity-70" : "opacity-0 pointer-events-none md:pointer-events-auto md:opacity-0"
              } max-md:opacity-70 max-md:pointer-events-auto`}
            >
              <ChevronLeft />
            </button>
            <button
              onClick={goNext}
              aria-label="Next slide"
              className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background-overlay flex items-center justify-center text-text-inverse backdrop-blur-sm transition-opacity duration-200 hover:opacity-100 ${
                isHovered ? "opacity-70" : "opacity-0 pointer-events-none md:pointer-events-auto md:opacity-0"
              } max-md:opacity-70 max-md:pointer-events-auto`}
            >
              <ChevronRight />
            </button>

            {/* Dot Indicators */}
            <div className="absolute bottom-20 md:bottom-24 left-0 right-0 z-20 flex justify-center gap-2">
              {SLIDES.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => goTo(index)}
                  aria-label={`Go to slide ${index + 1}: ${slide.title}`}
                  className={`rounded-full transition-all duration-300 ${
                    index === activeIndex
                      ? "w-6 h-2 bg-brand-primary"
                      : "w-2 h-2 bg-text-muted/40 hover:bg-text-muted/60"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
