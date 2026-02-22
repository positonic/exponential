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
    fontFamily: 'Inter, sans-serif',
    colors: {
      primary: 'from-blue-400 to-purple-600',
      secondary: 'from-blue-500 to-purple-600',
      background: {
        main: 'bg-background-primary',
        secondary: 'bg-background-secondary'
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
    name: 'exponential.im',
    logo: '/expo-logo-20.png',
    fontFamily: 'Inter, sans-serif',
    colors: {
        primary: 'from-blue-400 to-purple-600',
        secondary: 'from-blue-500 to-purple-600',
        background: {
          main: 'bg-background-primary',
          secondary: 'bg-background-secondary'
        },
        text: {
          primary: 'text-white',
          secondary: 'text-gray-400'
        }
      },
    branding: {
      title: 'Exponential - The OS for AI-Native Organizations',
      description: 'The coordination layer for AI-first organizations. Goals cascade into outcomes, AI handles execution, and your team stays aligned.',
      descriptionLonger: 'Exponential is the operating system where humans and AI build together. A coordination layer for AI-first organizations that connects goals to outcomes to actions — with AI handling execution while your team stays aligned on what matters.',
      heroTitle: 'Where humans and AI build together',
      heroSubtitle: 'The coordination layer for AI-first organizations. Goals cascade into outcomes. AI handles execution. Your team stays aligned.'
    }
  }
};

// Domain-specific customizations can be merged with the base theme

export const mantineThemes = {
    'forceflow.com': mantineTheme as MantineTheme,
    'exponential.im': mantineTheme as MantineTheme,
  } satisfies Record<ValidDomain, MantineTheme>;