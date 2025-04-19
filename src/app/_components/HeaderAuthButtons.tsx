'use client';

import React from 'react';
import { type Session } from 'next-auth'; // Assuming Session type is available
import { GetStartedButton } from './GetStartedButton';
import { TodayButton } from './TodayButton';

interface HeaderAuthButtonsProps {
  session: Session | null;
}

export function HeaderAuthButtons({ session }: HeaderAuthButtonsProps) {
  return (
    <>
      {session ? (
        <TodayButton />
      ) : (
        <GetStartedButton size="small" />
      )}
    </>
  );
} 