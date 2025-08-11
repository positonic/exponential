'use client';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { mantineTheme } from '~/styles/mantineTheme';
import type { PropsWithChildren } from 'react';

export function MantineRootProvider({ children }: PropsWithChildren) {
  return (
    <MantineProvider theme={mantineTheme}>
      <ModalsProvider>
        <Notifications position="top-right" zIndex={2000} />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}