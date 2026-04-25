import { Container } from "@mantine/core";

interface SectionContainerProps {
  id?: string;
  variant?: "default" | "dark" | "gradient" | "contrast";
  spacing?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  className?: string;
}

const spacingMap = {
  sm: "py-12 md:py-16",
  md: "py-16 md:py-20",
  lg: "py-20 md:py-28",
  xl: "py-28 md:py-36",
};

const variantMap = {
  default: "bg-background-primary",
  dark: "bg-gradient-problem-bg text-text-inverse",
  gradient: "bg-hero-gradient",
  contrast: "bg-cta-gradient text-text-inverse",
};

export function SectionContainer({
  id,
  variant = "default",
  spacing = "lg",
  children,
  className = "",
}: SectionContainerProps) {
  return (
    <section
      id={id}
      className={`${variantMap[variant]} ${spacingMap[spacing]} ${className}`}
    >
      <Container size="lg">{children}</Container>
    </section>
  );
}
