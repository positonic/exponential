import { startOfDay } from "date-fns";
import { api } from "~/trpc/server";
import { DayView } from "~/app/_components/DayView";
import { StartupRoutineForm } from "~/app/_components/StartupRoutineForm";

interface PageProps {
  params: Promise<{ date: string }>;
}

export default async function DayPage({ params }: PageProps) {
  const { date } = await params;
  const startOfDayDate = startOfDay(new Date(date));
  const day = await api.day.getByDate({ date: startOfDayDate });
  console.log('day', day);
  if (!day) return <StartupRoutineForm />;

  return <DayView day={day} />;
} 