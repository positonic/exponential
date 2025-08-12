// page.tsx
import { IconCode, IconUsers, IconRocket } from "@tabler/icons-react";
import { GetStartedButton } from '~/app/_components/GetStartedButton';
import { ThemeToggle } from '~/app/_components/ThemeToggle';
import { FeaturesSection } from '~/app/_components/FeaturesSection';
import { ValuePropositionSection } from '~/app/_components/ValuePropositionSection';
import { ProductRoadmapSection } from '~/app/_components/ProductRoadmapSection';
import { auth } from "~/server/auth";
import { HeaderAuthButtons } from "~/app/_components/HeaderAuthButtons";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { themes } from "~/config/themes";
import { getThemeDomain } from '~/config/site';

export default async function Home() {
  const session = await auth();
  const domain = getThemeDomain();
  const theme = themes[domain];

  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      {/* Navigation */}
      <header className="relative z-10 flex justify-between items-center py-6 px-8 border-b border-border-primary">
        <div className="flex items-center">
          <LogoDisplay theme={theme} href="/" className="text-xl" />
        </div>

        <nav className="hidden md:flex items-center space-x-8">
          <a href="#" className="text-purple-400 hover:text-white transition-colors">Home</a>
          <a href="#features" className="text-purple-400 hover:text-white transition-colors">What</a>
          <a href="#why" className="text-purple-400 hover:text-white transition-colors">Why</a>
          <a href="#roadmap" className="text-purple-400 hover:text-white transition-colors">How</a>
        </nav>

        <div className="flex items-center gap-2">
          <HeaderAuthButtons session={session} />
          <ThemeToggle />
        </div>
      </header>

      {/* Hero Section */}
      <main className="min-h-screen relative">
        <div className="absolute inset-0 bg-gradient-custom" />

        <div className="container mx-auto px-4 py-20 flex flex-col items-center text-center" style={{ background: `radial-gradient(circle at center, rgba(59, 130, 246, 0.2) 0%, rgba(55, 48, 163, 0.1) 45%, rgba(30, 27, 75, 0.05) 70%, rgba(15, 23, 42, 0) 100%)`, position: 'relative', zIndex: 10 }}>
          <div className="max-w-3xl mx-auto">
            <div className="mb-12">
              <span className="inline-block px-4 py-2 rounded-full bg-purple-900/30 text-purple-300 text-sm font-medium mb-6 border border-[rgb(107,33,168)]">
                The AI Co-Founder for Solo Entrepreneurs
              </span>
              <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-6">
                Turn Your Ideas Into Working Products
              </h1>
              <p className="text-gray-300 text-lg mb-8">
                Exponential helps solo founders execute faster and smarter. Plan, build, and iterate with AI support every step of the way.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <GetStartedButton />
                <a href="#" className="px-6 py-3 bg-transparent border border-gray-700 text-gray-300 font-medium rounded-md hover:bg-gray-800 transition-colors">
                  Learn More
                </a>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              {[
                {
                  icon: <IconRocket size={36} stroke={1.5} />,
                  iconBg: 'var(--color-surface-secondary)',
                  iconColor: 'var(--color-brand-primary)',
                  title: 'Product Execution Engine',
                  description: 'Go from idea to launch with AI-assisted planning and iteration.'
                },
                {
                  icon: <IconUsers size={36} stroke={1.5} />,
                  iconBg: 'var(--color-surface-secondary)',
                  iconColor: 'var(--color-brand-info)',
                  title: "Solo Doesn't Mean Alone",
                  description: 'Work with your AI partner to build, track, and execute faster.'
                },
                {
                  icon: <IconCode size={36} stroke={1.5} />,
                  iconBg: 'var(--color-surface-secondary)',
                  iconColor: 'var(--color-brand-primary)',
                  title: 'Integrated With GitHub',
                  description: 'Sync issues, milestones, and development tasks effortlessly.'
                }
              ].map((feature, index) => (
                <div key={index} style={{ background: 'linear-gradient(180deg, rgba(14, 23, 47, 0.5) 0%, rgba(11, 15, 36, 0.7) 100%)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: '1px', borderStyle: 'solid', borderRadius: '12px' }} className="p-6 transition-all duration-300 hover:border-opacity-20">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: feature.iconBg, boxShadow: `0 4px 16px rgba(79, 70, 229, 0.25)`, color: feature.iconColor }}>
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-gray-400">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Features Section */}
        <FeaturesSection id="features" />

        {/* Value Proposition Section */}
        <ValuePropositionSection id="why"/>

        {/* Product Roadmap Section */}
        <ProductRoadmapSection id="roadmap" />
      </main>
    </div>
  );
}
