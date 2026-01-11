// ValuePropositionSection.tsx
import React from "react";
import { Title, Text } from "@mantine/core";
import { IconTarget, IconCalendarWeek, IconBrain } from "@tabler/icons-react";

interface FeatureDetailCardProps {
  icon: React.ReactNode;
  iconColor: string;
  iconBgColor: string;
  title: string;
  description: string;
}

const FeatureDetailCard: React.FC<FeatureDetailCardProps> = ({
  icon,
  iconColor,
  iconBgColor,
  title,
  description
}) => (
  <div
    className="rounded-xl border border-[rgba(255,255,255,0.1)] p-8 transition-all duration-300 hover:border-[rgba(255,255,255,0.15)] hover:shadow-lg"
    style={{ backgroundColor: iconBgColor }}
  >
    <div className="mb-6" style={{ color: iconColor }}>
      {icon}
    </div>
    <h3 className="text-white text-2xl font-semibold mb-3">{title}</h3>
    <p className="text-text-muted leading-relaxed">{description}</p>
  </div>
);

// Add id prop to the component props interface
interface ValuePropositionSectionProps {
  id?: string;
}

// Update component definition to use the new props interface and accept the id prop
export const ValuePropositionSection: React.FC<ValuePropositionSectionProps> = ({ id }) => {
  const benefits = [
    "Connect daily work to quarterly goals",
    "Weekly reviews that surface patterns",
    "AI assistance with your actual context",
    "Migrate easily from Notion"
  ];

  const features = [
    {
      icon: <IconTarget size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-primary)",
      iconBgColor: "var(--color-surface-secondary)",
      title: "Strategic Clarity",
      description: "See your goal hierarchy at a glance. Know what matters and why."
    },
    {
      icon: <IconCalendarWeek size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-info)",
      iconBgColor: "var(--color-surface-secondary)",
      title: "Weekly Outcomes",
      description: "Plan your week around results, not activities. Track what actually moves the needle."
    },
    {
      icon: <IconBrain size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-success)",
      iconBgColor: "var(--color-surface-secondary)",
      title: "Context-Aware AI",
      description: "An assistant that knows your goals, projects, and priorities. Not generic advice."
    }
  ];

  // Pass the id prop to the root section element
  return (
    <section id={id} className="w-full py-24 bg-background-secondary">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          <div className="flex flex-col justify-center">
            <div className="mb-6">
              <span className="px-4 py-2 bg-surface-secondary rounded-full text-brand-primary text-sm font-medium">
                Why Use Exponential?
              </span>
            </div>

            <Title order={2} className="text-4xl md:text-5xl font-bold mb-6 text-white pb-4">
              Work That Connects to What Matters
            </Title>

            <Text className="text-text-muted text-xl mb-12 leading-relaxed">
              Most productivity tools help you check boxes. Exponential helps you know which boxes matter — and why.
            </Text>

            <div className="space-y-3 mt-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start mb-3">
                  <div className="text-brand-success mr-3 mt-1 flex-shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M7.5 12L10.5 15L16.5 9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                  <span className="text-text-muted">{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <FeatureDetailCard
                key={index}
                icon={feature.icon}
                iconColor={feature.iconColor}
                iconBgColor={feature.iconBgColor}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ValuePropositionSection;
