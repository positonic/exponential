// HowItWorksSection.tsx
import React from "react";
import { Title, Text } from "@mantine/core";
import { IconTarget, IconChartBar, IconChecklist, IconRefresh } from "@tabler/icons-react";

interface StepCardProps {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const StepCard: React.FC<StepCardProps> = ({
  number,
  icon,
  title,
  description
}) => (
  <div className="relative flex flex-col items-center text-center p-6">
    {/* Step number badge */}
    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-white text-sm font-bold">
      {number}
    </div>

    {/* Icon */}
    <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center mb-4 mt-4 text-brand-primary">
      {icon}
    </div>

    {/* Content */}
    <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
    <p className="text-text-muted leading-relaxed">{description}</p>
  </div>
);

interface HowItWorksSectionProps {
  id?: string;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({ id }) => {
  const steps: Omit<StepCardProps, 'number'>[] = [
    {
      icon: <IconTarget size={28} stroke={1.5} />,
      title: "Set Your Goals",
      description: "Define what you're trying to achieve this quarter. Connect goals to life domains that matter to you."
    },
    {
      icon: <IconChartBar size={28} stroke={1.5} />,
      title: "Define Outcomes",
      description: "Break goals into measurable weekly and monthly outcomes. Know what success looks like."
    },
    {
      icon: <IconChecklist size={28} stroke={1.5} />,
      title: "Execute With Focus",
      description: "Your daily actions are automatically connected to outcomes. Always know why you're doing what you're doing."
    },
    {
      icon: <IconRefresh size={28} stroke={1.5} />,
      title: "Reflect & Learn",
      description: "Weekly reviews show what you accomplished and what actually moved the needle. Iterate and improve."
    }
  ];

  return (
    <section id={id} className="w-full py-24 bg-background-secondary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <Title
            order={2}
            className="text-4xl md:text-5xl font-bold mb-6"
            style={{ color: "var(--color-brand-primary)" }}
          >
            How Exponential Works
          </Title>
          <Text className="text-text-muted text-lg max-w-2xl mx-auto">
            A simple system that connects strategy to execution. No complex setup required.
          </Text>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <StepCard
              key={index}
              number={index + 1}
              icon={step.icon}
              title={step.title}
              description={step.description}
            />
          ))}
        </div>

        {/* Connection line (desktop only) */}
        <div className="hidden lg:block relative -mt-32 mb-16">
          <div className="absolute top-1/2 left-[12.5%] right-[12.5%] h-0.5 bg-border-primary" />
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
