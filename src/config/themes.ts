import { type MantineTheme } from '@mantine/core';
import { createTheme } from '@mantine/core';
export type ValidDomain = 'forceflow.com' | 'exponential.im';

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
    descriptionLonger?: string;
    heroTitle: string;
    heroSubtitle: string;
    icons?: Array<{ rel: string; url: string }>;
  };
}

export const themes: Record<ValidDomain, ThemeConfig> = {
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
      title: 'Force Flow | Maybe the flow be with you',
      description: 'Harness Your Inner Force, Unleash Your Flow.',
      descriptionLonger: 'Transform your productivity with Force Flow - an AI-powered personal management system that helps you organize tasks, track projects, and make better decisions. Features smart project management, semantic search, and intelligent insights.',
      heroTitle: 'Transform the way you manage your life and projects',
      heroSubtitle: 'AI-powered productivity system that actually works.'
    }
  },
  'exponential.im': {
    name: 'Exponential',
    logo: '📈',
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
      title: 'Exponential',
      description: 'Scale Your Impact, Multiply Your Results.',
      descriptionLonger: 'Transform your productivity with Exponential - an AI-powered personal management system that helps you organize tasks, track projects, and make better decisions. Features smart project management, semantic search, and intelligent insights.',
      heroTitle: 'Turn Linear Progress into Exponential Growth',
      heroSubtitle: 'AI-powered system for exponential personal and professional growth.'
    }
  }
};

export const mantineThemes = {
    'forceflow.com': createTheme({
      colors: {
        blue: ['#e6f2ff', '#cce5ff', '#99caff', '#66b0ff', '#3395ff', '#007fff', '#0066cc', '#004d99', '#003366', '#001a33'],
        dark: ['#C1C2C5', '#A6A7AB', '#909296', '#5C5F66', '#373A40', '#2C2E33', '#25262B', '#262626', '#141517', '#101113'],
      },
      primaryColor: 'blue',
      primaryShade: 6,
    }),
    'exponential.im': createTheme({
        colors: {
            blue: ['#e6f2ff', '#cce5ff', '#99caff', '#66b0ff', '#3395ff', '#007fff', '#0066cc', '#004d99', '#003366', '#001a33'],
            dark: ['#C1C2C5', '#A6A7AB', '#909296', '#5C5F66', '#373A40', '#2C2E33', '#25262B', '#262626', '#141517', '#101113'],
          },
      primaryColor: 'blue',
      primaryShade: 6,
    }),
  } satisfies Record<ValidDomain, ReturnType<typeof createTheme>>;