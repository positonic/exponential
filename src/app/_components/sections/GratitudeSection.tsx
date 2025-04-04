'use client';

import { Stack, Divider } from "@mantine/core";
import { memo } from 'react';
import { WhatWentWellSection } from './WhatWentWellSection';
import { EnergyReflectionSection } from './EnergyReflectionSection';
import { GratitudeOnlySection } from './GratitudeOnlySection';
import { LearningGrowthSection } from './LearningGrowthSection';
import { ChallengesSection } from './ChallengesSection';

interface GratitudeSectionProps {
  dayId?: string;
  date: Date;
}

export const GratitudeSection = memo(({
  dayId,
  date
}: GratitudeSectionProps) => {
  return (
    <Stack gap="lg">
      {/* What went well today */}
      <WhatWentWellSection dayId={dayId} date={date} />
      
      <Divider my="sm" />
      
      
      {/* Gratitude */}
      <GratitudeOnlySection dayId={dayId} date={date} />
      
      <Divider my="sm" />
      
      
    </Stack>
  );
});

GratitudeSection.displayName = 'GratitudeSection'; 