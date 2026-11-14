import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

interface CTAButtonProps {
  href?: string;
  /**
   * `primary` and `secondary` are the older brand-fill buttons, still used by
   * the feature, learn and blog pages. The home page uses the marketing
   * surface's own pair (see `.mkt-btn` in globals.css): `pill` is the light
   * pill, `text` is the text link that sits next to it.
   */
  variant?: "primary" | "secondary" | "pill" | "ghost" | "text";
  size?: "small" | "default" | "large";
  showArrow?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const legacySizeClasses = {
  small: "px-5 py-2 text-sm",
  default: "px-6 py-3 text-base",
  large: "px-8 py-4 text-lg",
};

const legacyVariantClasses = {
  primary:
    "bg-brand-primary text-white font-semibold rounded-lg shadow-lg hover:bg-brand-primary-hover transition-all duration-200 hover:shadow-xl hover:scale-105",
  secondary:
    "bg-surface-secondary border-2 border-border-primary text-text-primary font-semibold rounded-lg hover:bg-surface-hover hover:border-border-focus transition-all duration-200",
};

export function CTAButton({
  href = "/signin",
  variant = "primary",
  size = "default",
  showArrow = true,
  children,
  className = "",
  onClick,
}: CTAButtonProps) {
  let buttonClasses: string;
  let hasArrow: boolean;

  if (variant === "text") {
    buttonClasses = `mkt-link ${className}`;
    hasArrow = showArrow;
  } else if (variant === "pill" || variant === "ghost") {
    const sizeClass = size === "large" ? "mkt-btn-lg" : "";
    const variantClass =
      variant === "pill" ? "mkt-btn-primary" : "mkt-btn-ghost";
    buttonClasses = `mkt-btn ${sizeClass} ${variantClass} ${className}`;
    // A pill carries no arrow: the fill already says "this is the action".
    hasArrow = false;
  } else {
    buttonClasses = `inline-flex items-center justify-center gap-2 ${legacySizeClasses[size]} ${legacyVariantClasses[variant]} ${className}`;
    hasArrow = showArrow && variant === "primary";
  }

  const arrow = hasArrow ? (
    <IconArrowRight size={variant === "text" ? 16 : 20} stroke={2} />
  ) : null;

  if (onClick) {
    return (
      <button className={buttonClasses} onClick={onClick}>
        {children}
        {arrow}
      </button>
    );
  }

  return (
    <Link href={href} className={buttonClasses}>
      {children}
      {arrow}
    </Link>
  );
}
