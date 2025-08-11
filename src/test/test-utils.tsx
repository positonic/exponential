import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// Import your theme configuration
import { mantineTheme } from '~/styles/mantineTheme';

function render(ui: React.ReactElement, options = {}) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MantineProvider theme={mantineTheme}>
        {children}
      </MantineProvider>
    );
  }
  
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

// Re-export everything
export * from '@testing-library/react';
export { render };