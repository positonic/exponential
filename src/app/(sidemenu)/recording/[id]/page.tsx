'use client';

import { use } from "react";
import { MeetingDetailContainer } from "~/app/_components/meeting/MeetingDetailContainer";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MeetingDetailContainer id={id} />;
}
