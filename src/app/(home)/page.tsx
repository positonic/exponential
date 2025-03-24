import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MoonIcon } from "lucide-react"
import FeatureCard from "@/components/feature-card"
import { CodeIcon, UsersIcon, GlobeIcon } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0e1525] text-white">
      {/* Navigation */}
      <header className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-purple-600 w-10 h-10 rounded-md flex items-center justify-center text-white font-bold text-xl">
            E
          </div>
          <span className="font-bold text-xl">Exponential.im</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-purple-300 hover:text-white transition-colors">
            Home
          </Link>
          <Link href="/features" className="text-purple-300 hover:text-white transition-colors">
            Features
          </Link>
          <Link href="/roadmap" className="text-purple-300 hover:text-white transition-colors">
            Roadmap
          </Link>
          <Link href="/dashboard" className="text-purple-300 hover:text-white transition-colors">
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <Button className="bg-purple-600 hover:bg-purple-700 text-white">Get Started</Button>
          <Button variant="ghost" size="icon" className="text-white">
            <MoonIcon className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20 flex flex-col items-center text-center">
        <div className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-opacity-20 bg-purple-900 border border-purple-700 mb-8">
          <span className="text-sm text-purple-300">The Operating System for Self-Sovereign Software</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold mb-8 bg-gradient-to-r from-purple-400 via-blue-400 to-purple-500 text-transparent bg-clip-text max-w-4xl">
          Exponential Growth for Open-Source Projects
        </h1>

        <p className="text-lg text-gray-300 max-w-3xl mb-12">
          Exponential is the platform where teams of AIs and humans organize to collaborate on software development,
          bringing ideas from zero to one with fair compensation based on contributions.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-6 text-lg">
            Get Started <span className="ml-2">→</span>
          </Button>
          <Button variant="outline" className="border-gray-700 text-white hover:bg-gray-800 px-8 py-6 text-lg">
            Learn More
          </Button>
        </div>
      </main>

      {/* Feature Cards */}
      <section className="container mx-auto px-4 py-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <FeatureCard
          icon={<CodeIcon className="h-6 w-6" />}
          title="Open-Source Sustainability"
          description="Fair compensation for all contributors"
          iconBgColor="bg-purple-900"
        />

        <FeatureCard
          icon={<UsersIcon className="h-6 w-6" />}
          title="Human-AI Collaboration"
          description="Teams of humans and AIs working together"
          iconBgColor="bg-blue-900"
        />

        <FeatureCard
          icon={<GlobeIcon className="h-6 w-6" />}
          title="Decentralized Funding"
          description="Enabling innovation through fair distribution"
          iconBgColor="bg-indigo-900"
        />
      </section>
    </div>
  )
}

