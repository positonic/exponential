import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

interface CTAButtonProps {
  href?: string;
  variant?: "primary" | "secondary";
  size?: "default" | "large";
  showArrow?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function CTAButton({
  href = "/signin",
  variant = "primary",
  size = "default",
  showArrow = true,
  children,
  className = "",
  onClick,
}: CTAButtonProps) {
  const sizeClasses = {
    default: "px-6 py-3 text-base",
    large: "px-8 py-4 text-lg",
  };

  const variantClasses = {
    primary:
      "bg-cta-gradient text-white font-semibold rounded-lg shadow-lg hover:opacity-90 transition-all duration-200 hover:shadow-xl",
    secondary:
      "bg-transparent border border-border-primary text-text-primary font-medium rounded-lg hover:bg-surface-hover transition-colors duration-200",
  };

  const buttonClasses = `inline-flex items-center justify-center gap-2 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;

  if (onClick) {
    return (
      <button className={buttonClasses} onClick={onClick}>
        {children}
        {showArrow && variant === "primary" && (
          <IconArrowRight size={20} stroke={2} />
        )}
      </button>
    );
  }

  return (
    <Link href={href} className={buttonClasses}>
      {children}
      {showArrow && variant === "primary" && (
        <IconArrowRight size={20} stroke={2} />
      )}
    </Link>
  );
}
