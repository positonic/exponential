export type ThemeConfig = {
  name: string;
  logo: string;
  colors: {
    primary: string;
    secondary: string;
    background: {
      main: string;
      secondary: string;
    };
    text: {
      primary: string;
      secondary: string;
    };
  };
  branding: {
    title: string;
    description: string;
    heroTitle: string;
    heroSubtitle: string;
  };
}

export const themes: Record<string, ThemeConfig> = {
  'forceflow.com': {
    name: 'Force Flow',
    logo: '🧘‍♂️',
    colors: {
      primary: 'from-blue-400 to-purple-600',
      secondary: 'from-blue-500 to-purple-600',
      background: {
        main: 'bg-[#1E1E1E]',
        secondary: 'bg-[#262626]'
      },
      text: {
        primary: 'text-white',
        secondary: 'text-gray-400'
      }
    },
    branding: {
      title: 'Force Flow',
      description: 'Harness Your Inner Force, Unleash Your Flow.',
      heroTitle: 'Transform the way you manage your life and projects',
      heroSubtitle: 'AI-powered productivity system that actually works.'
    }
  },
  'yoursecondapp.com': {
    name: 'Second App',
    logo: '🚀',
    colors: {
      primary: 'from-green-400 to-blue-600',
      secondary: 'from-green-500 to-blue-600',
      background: {
        main: 'bg-[#0F172A]',
        secondary: 'bg-[#1E293B]'
      },
      text: {
        primary: 'text-white',
        secondary: 'text-gray-300'
      }
    },
    branding: {
      title: 'Second App',
      description: 'Your Alternative Tagline',
      heroTitle: 'Your Alternative Hero Title',
      heroSubtitle: 'Your Alternative Hero Subtitle'
    }
  }
}; 