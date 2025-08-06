import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";
import TeamDetailClient from "./TeamDetailClient";

interface TeamDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function TeamDetailPage({ params }: TeamDetailPageProps) {
  const session = await auth();
  const { slug } = await params;

  if (!session?.user) {
    redirect(`/use-the-force?callbackUrl=/teams/${slug}`);
  }

  try {
    const team = await api.team.getBySlug({ slug });
    
    return (
      <TeamDetailClient 
        team={team} 
        currentUserId={session.user.id}
      />
    );
  } catch {
    // Team not found or access denied
    redirect('/teams');
  }
}