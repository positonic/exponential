// ValuePropositionSection.tsx
import React from "react";
import { Container, Title, Text } from "@mantine/core";
import { IconRocket, IconUsers, IconCode } from "@tabler/icons-react";

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
    <p className="text-[#cbd5e1] leading-relaxed">{description}</p>
  </div>
);

export const ValuePropositionSection: React.FC = () => {
  const benefits = [
    "Solo-founder focused",
    "Product execution mastery",
    "Human-AI collaboration",
    "Idea to launch acceleration"
  ];

  const features = [
    {
      icon: <IconRocket size={32} stroke={1.5} />,
      iconColor: "#fcd34d",
      iconBgColor: "#170F24",
      title: "Execution Acceleration",
      description: "Focus on shipping — AI guides your planning, task breakdown, and iteration."
    },
    {
      icon: <IconUsers size={32} stroke={1.5} />,
      iconColor: "#93c5fd",
      iconBgColor: "#0F1224",
      title: "AI Partner for Founders",
      description: "Work hand-in-hand with an intelligent assistant that helps organize your ideas and actions."
    },
    {
      icon: <IconCode size={32} stroke={1.5} />,
      iconColor: "#6ee7b7",
      iconBgColor: "#172033",
      title: "Seamless GitHub Integration",
      description: "Automatically syncs with your issues, milestones, and repositories."
    }
  ];

  return (
    <section className="w-full py-24 bg-[#1E293B]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          <div className="flex flex-col justify-center">
            <div className="mb-6">
              <span className="px-4 py-2 bg-[#1e293b] rounded-full text-[#a78bfa] text-sm font-medium">
                Why Use Exponential?
              </span>
            </div>

            <Title className="text-4xl md:text-5xl font-bold mb-6 text-white pb-4">
              Your AI-Powered Product Execution Engine
            </Title>

            <Text className="text-[#cbd5e1] text-xl mb-12 leading-relaxed">
              Whether you&apos;re prototyping a side project or launching a startup solo, Exponential helps you stay focused, move faster, and build smarter — with the power of AI.
            </Text>

            <div className="space-y-3 mt-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start mb-3">
                  <div className="text-[#10b981] mr-3 mt-1 flex-shrink-0">
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
                  <span className="text-[#cbd5e1]">{benefit}</span>
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
