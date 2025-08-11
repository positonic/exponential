import type { MantineTheme } from '@mantine/core';
import { mantineTheme } from '~/styles/mantineTheme';
export type ValidDomain = 'forceflow.com' | 'exponential.im';

export type ThemeConfig = {
  name: string;
  logo: string;
  fontFamily?: string;
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
    fontFamily: 'Orbitron, sans-serif',
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
      heroSubtitle: 'AI-powered productivity system that actually works. Transform the way you manage your life and projects with an AI-powered productivity system that actually works.'
    }
  },
  'exponential.im': {
    name: 'Exponential.im',
    logo: '/expo-logo-20.png',
    fontFamily: 'Orbitron, sans-serif',
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
      title: 'Exponential - AI-Powered Productivity Platform for Solo Founders',
      description: 'Turn your ideas into working products faster with Exponential. AI-powered project management, task automation, and GitHub integration designed for solo entrepreneurs and founders.',
      descriptionLonger: 'Transform your productivity with Exponential - an AI-powered personal management system that helps you organize tasks, track projects, and make better decisions. Features smart project management, semantic search, and intelligent insights.',
      heroTitle: 'Turn Linear Progress into Exponential Growth',
      heroSubtitle: 'AI-powered system for exponential personal and professional growth.'
    }
  }
};

// Domain-specific customizations can be merged with the base theme

export const mantineThemes = {
    'forceflow.com': mantineTheme as MantineTheme,
    'exponential.im': mantineTheme as MantineTheme,
  } satisfies Record<ValidDomain, MantineTheme>;