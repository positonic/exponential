import React from "react";
import { Container, Group, Title, Text } from "@mantine/core";
import { 
  IconBolt, 
  IconMedal, 
  IconUsers, 
  IconCode 
} from "@tabler/icons-react";
import { IconCheck } from "@tabler/icons-react";

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
  <div className="rounded-xl border border-[rgba(255,255,255,0.1)] p-8 transition-all duration-300 hover:border-[rgba(255,255,255,0.15)] hover:shadow-lg" 
    style={{ backgroundColor: iconBgColor }}>
    <div className="mb-6" style={{ color: iconColor }}>
      {icon}
    </div>
    <h3 className="text-white text-2xl font-semibold mb-3">{title}</h3>
    <p className="text-[#cbd5e1] leading-relaxed">{description}</p>
  </div>
);

const BenefitItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-3 mb-4">
    <IconCheck size={20} className="text-emerald-500 mt-0.5 flex-shrink-0" />
    <Text className="text-[#cbd5e1] text-lg">{children}</Text>
  </div>
);

export const ValuePropositionSection: React.FC = () => {
  const features = [
    {
      icon: <IconBolt size={32} stroke={1.5} />,
      iconColor: "#c4b5fd", // Light purple
      iconBgColor: "#170F24", // Dark purple background
      title: "HyperFund Mechanism",
      description: "Stake HyperCerts to earn governance tokens and participate in project funding decisions."
    },
    {
      icon: <IconMedal size={32} stroke={1.5} />,
      iconColor: "#93c5fd", // Light blue
      iconBgColor: "#0F1224", // Dark blue background
      title: "Impact Evaluation",
      description: "Proof of ship with SolEng integration to evaluate and reward contributions fairly."
    },
    {
      icon: <IconUsers size={32} stroke={1.5} />,
      iconColor: "#c4b5fd", // Light purple
      iconBgColor: "#151E31", // Dark purple background
      title: "AI Project Manager",
      description: "Intelligent coordination of tasks and resources to optimize project workflows."
    },
    {
      icon: <IconCode size={32} stroke={1.5} />,
      iconColor: "#6ee7b7", // Light green
      iconBgColor: "#172033", // Dark green background
      title: "GitHub Integration",
      description: "Seamless connection with existing repositories for issue tracking and milestone setting."
    }
  ];

  const benefits = [
    "Open-source sustainability",
    "Fair compensation for contributions",
    "Human-AI collaboration",
    "Decentralized funding for innovation",
    "Rewarding early contributors",
    "Enabling self-sovereign software development"
  ];

  return (
    <section className="w-full py-24 bg-[#1E293B]">
      <Container size="lg">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Left column */}
          <div>
            <div className="inline-block px-5 py-2 rounded-full bg-[#1a2748] text-[#8896c5] text-sm font-medium mb-6">
              Value Proposition
            </div>
            
            <Title
              className="text-4xl md:text-5xl font-bold mb-6 text-white"
            >
              The Platform Where Self-Sovereign Software Development Thrives
            </Title>
            
            <Text 
              className="text-[#cbd5e1] text-xl mb-12 leading-relaxed"
            >
              Exponential enables projects to find early funding, attract non-financial contributors, and fairly compensate open-source developers based on their relative contributions.
            </Text>

            <div className="space-y-1">
              {benefits.map((benefit, index) => (
                <BenefitItem key={index}>{benefit}</BenefitItem>
              ))}
            </div>
          </div>

          {/* Right column - Feature cards */}
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
      </Container>
    </section>
  );
}; 