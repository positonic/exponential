import { Container } from "@mantine/core";

interface StatsSectionProps {
  id?: string;
}

const stats = [
  {
    value: "50+",
    label: "Active Founders",
  },
  {
    value: "10k+",
    label: "Tasks Completed",
  },
  {
    value: "95%",
    label: "Goal Achievement",
  },
  {
    value: "3x",
    label: "Productivity Boost",
  },
];

export function StatsSection({ id }: StatsSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-12 md:py-16 border-y border-border-primary">
      <Container size="lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-accent-indigo mb-2 font-inter">
                {stat.value}
              </div>
              <div className="text-sm md:text-base text-text-secondary font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
