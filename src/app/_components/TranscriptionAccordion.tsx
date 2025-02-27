'use client';

import { Accordion } from '@mantine/core';

interface TranscriptionAccordionProps {
  transcription: string;
}

export function TranscriptionAccordion({ transcription }: TranscriptionAccordionProps) {
  return (
    <Accordion>
      <Accordion.Item value="transcription">
        <Accordion.Control><h2 className="text-lg font-semibold">Transcription</h2>
        </Accordion.Control>
        <Accordion.Panel>
          <div className="space-y-4">
            {transcription}
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
} 