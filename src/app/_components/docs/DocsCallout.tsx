import {
  IconInfoCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconBulb,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

type CalloutType = "info" | "warning" | "success" | "tip";

interface DocsCalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

const calloutConfig: Record<
  CalloutType,
  {
    icon: typeof IconInfoCircle;
    bgClass: string;
    borderClass: string;
    iconClass: string;
    titleClass: string;
  }
> = {
  info: {
    icon: IconInfoCircle,
    bgClass: "bg-blue-500/10",
    borderClass: "border-blue-500/30",
    iconClass: "text-blue-500",
    titleClass: "text-blue-600 dark:text-blue-400",
  },
  warning: {
    icon: IconAlertTriangle,
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
    iconClass: "text-amber-500",
    titleClass: "text-amber-600 dark:text-amber-400",
  },
  success: {
    icon: IconCircleCheck,
    bgClass: "bg-green-500/10",
    borderClass: "border-green-500/30",
    iconClass: "text-green-500",
    titleClass: "text-green-600 dark:text-green-400",
  },
  tip: {
    icon: IconBulb,
    bgClass: "bg-violet-500/10",
    borderClass: "border-violet-500/30",
    iconClass: "text-violet-500",
    titleClass: "text-violet-600 dark:text-violet-400",
  },
};

export function DocsCallout({
  type = "info",
  title,
  children,
}: DocsCalloutProps) {
  const config = calloutConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={`my-4 rounded-lg border ${config.bgClass} ${config.borderClass} p-4`}
    >
      <div className="flex gap-3">
        <Icon size={20} className={`mt-0.5 shrink-0 ${config.iconClass}`} />
        <div className="min-w-0 flex-1">
          {title && (
            <p className={`mb-1 font-medium ${config.titleClass}`}>{title}</p>
          )}
          <div className="text-sm text-text-secondary">{children}</div>
        </div>
      </div>
    </div>
  );
}
