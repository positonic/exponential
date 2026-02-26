'use client';

import Image from 'next/image';

/**
 * Animated hub-and-spoke illustration showing tools connecting into Exponential.
 * Used on the onboarding "See how Exponential works" step.
 */

interface ToolNode {
  name: string;
  icon: string;
  /** Angle in degrees around the center (0 = right, 90 = bottom) */
  angle: number;
  /** Distance from center as fraction of container (0-1) */
  radius: number;
  /** Animation delay in seconds */
  delay: number;
}

const TOOLS: ToolNode[] = [
  { name: 'Google Calendar', icon: '/integrations/google-calendar.svg', angle: 0, radius: 0.38, delay: 0 },
  { name: 'Outlook', icon: '/integrations/outlook.svg', angle: 36, radius: 0.4, delay: 0.3 },
  { name: 'Slack', icon: '/integrations/slack.svg', angle: 72, radius: 0.36, delay: 0.6 },
  { name: 'Discord', icon: '/integrations/discord.svg', angle: 108, radius: 0.42, delay: 0.9 },
  { name: 'GitHub', icon: '/integrations/github.svg', angle: 144, radius: 0.38, delay: 1.2 },
  { name: 'Linear', icon: '/integrations/linear.svg', angle: 180, radius: 0.4, delay: 1.5 },
  { name: 'Asana', icon: '/integrations/asana.svg', angle: 216, radius: 0.36, delay: 1.8 },
  { name: 'Google Drive', icon: '/integrations/google-drive.svg', angle: 252, radius: 0.42, delay: 2.1 },
  { name: 'WhatsApp', icon: '/integrations/whatsapp.svg', angle: 288, radius: 0.38, delay: 2.4 },
  { name: 'Fireflies', icon: '/integrations/fireflies.svg', angle: 324, radius: 0.4, delay: 2.7 },
];

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function OnboardingIntegrationIllustration() {
  const size = 480;
  const cx = size / 2;
  const cy = size / 2;
  const hubRadius = 40;

  return (
    <div className="relative w-full max-w-lg mx-auto aspect-square">
      {/* CSS animations */}
      <style jsx>{`
        @keyframes fadeInScale {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 0.15;
          }
          50% {
            opacity: 0.35;
          }
        }
        @keyframes drawLine {
          0% {
            stroke-dashoffset: 200;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes dotTravel {
          0% {
            offset-distance: 0%;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            offset-distance: 100%;
            opacity: 0;
          }
        }
        @keyframes hubPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 var(--color-brand-primary);
          }
          50% {
            box-shadow: 0 0 20px 8px var(--color-brand-primary);
          }
        }
      `}</style>

      {/* SVG lines connecting tools to center */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      >
        <defs>
          {/* Gradient for connection lines */}
          {TOOLS.map((tool, i) => {
            const tx = cx + Math.cos(toRad(tool.angle)) * tool.radius * size;
            const ty = cy + Math.sin(toRad(tool.angle)) * tool.radius * size;
            return (
              <linearGradient
                key={`grad-${i}`}
                id={`line-grad-${i}`}
                x1={cx}
                y1={cy}
                x2={tx}
                y2={ty}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.6" />
                <stop offset="100%" stopColor="var(--color-accent-periwinkle)" stopOpacity="0.2" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Connection lines */}
        {TOOLS.map((tool, i) => {
          const tx = cx + Math.cos(toRad(tool.angle)) * tool.radius * size;
          const ty = cy + Math.sin(toRad(tool.angle)) * tool.radius * size;
          // Curved path through a control point offset from midpoint
          const mx = (cx + tx) / 2;
          const my = (cy + ty) / 2;
          const perpAngle = toRad(tool.angle + 90);
          const curvature = 20;
          const cpx = mx + Math.cos(perpAngle) * curvature;
          const cpy = my + Math.sin(perpAngle) * curvature;
          const pathD = `M ${tx} ${ty} Q ${cpx} ${cpy} ${cx} ${cy}`;

          return (
            <g key={`line-${i}`}>
              {/* The line itself */}
              <path
                d={pathD}
                stroke={`url(#line-grad-${i})`}
                strokeWidth="1.5"
                fill="none"
                strokeDasharray="200"
                strokeDashoffset="200"
                style={{
                  animation: `drawLine 1.2s ease-out ${tool.delay}s forwards`,
                }}
              />
              {/* Traveling dot */}
              <circle
                r="3"
                fill="var(--color-brand-primary)"
                style={{
                  offsetPath: `path('${pathD}')`,
                  animation: `dotTravel 2.5s ease-in-out ${tool.delay + 1.2}s infinite`,
                  opacity: 0,
                } as React.CSSProperties}
              />
            </g>
          );
        })}
      </svg>

      {/* Center hub - Exponential logo */}
      <div
        className="absolute rounded-full bg-surface-primary border-2 border-brand-primary/40 flex items-center justify-center shadow-xl"
        style={{
          width: hubRadius * 2,
          height: hubRadius * 2,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          animation: 'hubPulse 3s ease-in-out infinite',
        }}
      >
        <Image
          src="/expo-logo-20.png"
          alt="Exponential"
          width={52}
          height={52}
          className="rounded-full"
        />
      </div>

      {/* Subtle glow behind hub */}
      <div
        className="absolute rounded-full bg-brand-primary/10 blur-2xl"
        style={{
          width: 120,
          height: 120,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          animation: 'pulseGlow 3s ease-in-out infinite',
        }}
      />

      {/* Tool nodes */}
      {TOOLS.map((tool, i) => {
        const leftPct = 50 + Math.cos(toRad(tool.angle)) * tool.radius * 100;
        const topPct = 50 + Math.sin(toRad(tool.angle)) * tool.radius * 100;

        return (
          <div
            key={i}
            className="absolute flex flex-col items-center gap-1"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 15,
              opacity: 0,
              animation: `fadeInScale 0.6s ease-out ${tool.delay}s forwards`,
            }}
          >
            <div className="w-14 h-14 rounded-full bg-surface-primary border border-border-primary shadow-lg flex items-center justify-center">
              <Image
                src={tool.icon}
                alt={tool.name}
                width={30}
                height={30}
              />
            </div>
            <span className="text-[10px] text-text-secondary font-medium whitespace-nowrap">
              {tool.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
