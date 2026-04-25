'use client';

/**
 * Animated weekly schedule illustration for the onboarding "Set your work hours" step.
 * Shows a visual grid of a work week with time blocks that animate in.
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm'];

// Which cells are "work hours" (dayIndex 0-4 = Mon-Fri, hourIndex 1-9 = 9am-5pm)
function isWorkBlock(dayIndex: number, hourIndex: number) {
  return dayIndex < 5 && hourIndex >= 1 && hourIndex <= 8;
}

// Lunch break (12pm = index 4)
function isLunchBlock(dayIndex: number, hourIndex: number) {
  return dayIndex < 5 && hourIndex === 4;
}

// "Meeting" accent blocks for visual interest
function isMeetingBlock(dayIndex: number, hourIndex: number) {
  return (
    (dayIndex === 0 && hourIndex === 2) ||
    (dayIndex === 1 && hourIndex === 5) ||
    (dayIndex === 1 && hourIndex === 6) ||
    (dayIndex === 2 && hourIndex === 1) ||
    (dayIndex === 2 && hourIndex === 2) ||
    (dayIndex === 3 && hourIndex === 7) ||
    (dayIndex === 4 && hourIndex === 3)
  );
}

// "Focus time" blocks
function isFocusBlock(dayIndex: number, hourIndex: number) {
  return (
    (dayIndex === 0 && hourIndex === 5) ||
    (dayIndex === 0 && hourIndex === 6) ||
    (dayIndex === 0 && hourIndex === 7) ||
    (dayIndex === 2 && hourIndex === 5) ||
    (dayIndex === 2 && hourIndex === 6) ||
    (dayIndex === 4 && hourIndex === 6) ||
    (dayIndex === 4 && hourIndex === 7)
  );
}

export function OnboardingWorkHoursIllustration() {
  return (
    <div className="w-full max-w-lg mx-auto">
      {/* CSS animations */}
      <style jsx>{`
        @keyframes blockFadeIn {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translateY(-8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes headerFade {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @keyframes currentTimeLine {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>

      <div
        className="bg-surface-primary border border-border-primary rounded-2xl p-6 shadow-xl"
        style={{
          opacity: 0,
          animation: 'headerFade 0.5s ease-out 0.1s forwards',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-brand-primary">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-text-primary">Work Schedule</span>
          </div>
          <span className="text-xs text-text-muted">This week</span>
        </div>

        {/* Schedule grid */}
        <div className="overflow-hidden">
          {/* Day headers */}
          <div className="grid gap-1" style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}>
            <div /> {/* Empty corner */}
            {DAYS.map((day, i) => (
              <div
                key={day}
                className={`text-center text-[10px] font-medium pb-2 ${
                  i < 5 ? 'text-text-primary' : 'text-text-muted'
                }`}
                style={{
                  opacity: 0,
                  animation: `slideDown 0.4s ease-out ${0.2 + i * 0.05}s forwards`,
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Time rows */}
          {HOURS.map((hour, hourIndex) => (
            <div
              key={hour}
              className="grid gap-1 mb-1"
              style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}
            >
              {/* Hour label */}
              <div
                className="text-[9px] text-text-muted flex items-center justify-end pr-2"
                style={{
                  opacity: 0,
                  animation: `headerFade 0.3s ease-out ${0.3 + hourIndex * 0.05}s forwards`,
                }}
              >
                {hour}
              </div>

              {/* Day cells */}
              {DAYS.map((_day, dayIndex) => {
                const isWork = isWorkBlock(dayIndex, hourIndex);
                const isLunch = isLunchBlock(dayIndex, hourIndex);
                const isMeeting = isMeetingBlock(dayIndex, hourIndex);
                const isFocus = isFocusBlock(dayIndex, hourIndex);
                const delay = 0.4 + dayIndex * 0.06 + hourIndex * 0.04;

                let bgClass = 'bg-surface-tertiary/30';
                if (isWork && !isLunch) {
                  if (isMeeting) {
                    bgClass = 'bg-accent-periwinkle/30';
                  } else if (isFocus) {
                    bgClass = 'bg-brand-primary/25';
                  } else {
                    bgClass = 'bg-brand-primary/10';
                  }
                } else if (isLunch) {
                  bgClass = 'bg-surface-tertiary/50';
                }

                return (
                  <div
                    key={`${dayIndex}-${hourIndex}`}
                    className={`h-5 rounded-sm ${bgClass}`}
                    style={{
                      opacity: 0,
                      animation: isWork
                        ? `blockFadeIn 0.3s ease-out ${delay}s forwards`
                        : `headerFade 0.3s ease-out ${delay}s forwards`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div
          className="flex items-center gap-4 mt-4 pt-3 border-t border-border-primary"
          style={{
            opacity: 0,
            animation: 'headerFade 0.5s ease-out 1.2s forwards',
          }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-brand-primary/25" />
            <span className="text-[9px] text-text-muted">Focus</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-accent-periwinkle/30" />
            <span className="text-[9px] text-text-muted">Meetings</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-brand-primary/10" />
            <span className="text-[9px] text-text-muted">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-surface-tertiary/50" />
            <span className="text-[9px] text-text-muted">Break</span>
          </div>
        </div>
      </div>
    </div>
  );
}
