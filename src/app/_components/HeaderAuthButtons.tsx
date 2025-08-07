'use client';

import React from 'react';
import { type Session } from 'next-auth'; // Assuming Session type is available
import { GetStartedButton } from './GetStartedButton';
import { TodayButton } from './TodayButton';
import { TodayLinkButton } from './TodayLinkButton';
interface HeaderAuthButtonsProps {
  session: Session | null;
}

export function HeaderAuthButtons({ session }: HeaderAuthButtonsProps) {
  return (
    <>
      {session ? (
        <>
        {/* <TodayButton /> */}
        <TodayLinkButton />
        </>
      ) : (
        <GetStartedButton size="small" />
      )}
    </>
  );
} 