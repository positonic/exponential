'use client';

import { type PropsWithChildren } from "react";
import { useTheme } from '~/providers/ThemeProvider';

export function ThemeWrapper({ children }: PropsWithChildren) {
  const theme = useTheme();

  return (
    <div className={`min-h-screen ${theme.colors.background.main} ${theme.colors.text.primary}`}>
      <div className="flex">
        {children}
      </div>
    </div>
  );
} 