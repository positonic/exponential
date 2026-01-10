import React from "react";
import { Container, Title/*, Text*/, SimpleGrid } from "@mantine/core";
import {
  IconTarget,
  IconSun,
  IconCalendarWeek,
  IconBrain
} from "@tabler/icons-react";

interface FeatureCardProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
}

interface FeaturesSectionProps {
  id?: string; 
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  iconColor,
  title,
  description
}) => (
  <div className="rounded-xl border border-border-primary bg-surface-secondary p-8 transition-all duration-300 hover:border-border-focus hover:shadow-md">
    <div className="mb-5" style={{ color: iconColor }}>
      {icon}
    </div>
    <h3 className="text-white text-xl font-semibold mb-3">{title}</h3>
    <p className="text-text-muted leading-relaxed text-base">{description}</p>
  </div>
);

export const FeaturesSection: React.FC<FeaturesSectionProps> = ({ id }) => {
  // Feature data aligned to Jobs-To-Be-Done
  const features: FeatureCardProps[] = [
    {
      icon: <IconTarget size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-primary)",
      title: "Strategic Alignment",
      description: "Every task links to a goal. Never ask 'why am I doing this?' again. See the full hierarchy from vision to execution."
    },
    {
      icon: <IconSun size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-warning)",
      title: "Daily Focus",
      description: "Your morning starts with clarity. See today's priorities connected to this week's outcomes. No more planning paralysis."
    },
    {
      icon: <IconCalendarWeek size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-info)",
      title: "Weekly Reset",
      description: "Built-in weekly review. See what you accomplished and what actually moved the needle. Course-correct before it's too late."
    },
    {
      icon: <IconBrain size={32} stroke={1.5} />,
      iconColor: "var(--color-brand-success)",
      title: "AI Thought Partner",
      description: "Ask for help and get answers that understand your specific goals and projects. Not generic advice from a chatbot."
    }
  ];

  return (
    <section id={id} className="py-24 w-full bg-background-primary">
      <Container size="lg">
        <div className="mb-16 text-center">
          <Title
            order={2}
            className="text-4xl md:text-5xl font-bold mb-6"
            style={{ color: "var(--color-brand-primary)" }}
          >
            Finally, a System That Connects the Dots
          </Title>
          <p className="text-gray-300 text-lg mb-8 max-w-[60%] mx-auto">
            Designed around how strategic thinkers actually work. Not just another task list.
          </p>
        </div>

        <SimpleGrid
          cols={{ base: 1, md: 2 }}
          spacing={{ base: 16, md: 24 }}
          verticalSpacing={{ base: 16, md: 24 }}
        >
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              iconColor={feature.iconColor}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </SimpleGrid>
      </Container>
    </section>
  );
}; 