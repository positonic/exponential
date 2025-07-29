import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";
import TeamDetailClient from "./TeamDetailClient";

interface TeamDetailPageProps {
  params: {
    slug: string;
  };
}

export default async function TeamDetailPage({ params }: TeamDetailPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect(`/use-the-force?callbackUrl=/teams/${params.slug}`);
  }

  try {
    const team = await api.team.getBySlug({ slug: params.slug });
    
    return (
      <TeamDetailClient 
        team={team} 
        currentUserId={session.user.id}
      />
    );
  } catch (error) {
    // Team not found or access denied
    redirect('/teams');
  }
}