import { type ValidDomain } from './themes';

export function getThemeDomain(): ValidDomain {
  return (process.env.NEXT_PUBLIC_THEME_DOMAIN ?? 'forceflow.com') as ValidDomain;
} 