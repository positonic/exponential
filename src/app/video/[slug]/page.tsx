import { Paper, Badge, Button } from '@mantine/core';
import Link from "next/link";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { getVideoBySlug } from "~/server/api/routers/video";
import { parseVTT } from '~/utils/vttParser';
import { TranscriptionAccordion } from '~/app/_components/TranscriptionAccordion';
import { SummarizeButton } from '~/app/_components/SummarizeButton';

export default async function VideoPage({ params }: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const session = await auth();
  const video = await getVideoBySlug(slug);

  const captions = video?.transcription ? parseVTT(video.transcription) : [];
  const transcription = captions.map(caption => caption.text).join(' ');
  
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <HydrateClient>
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-6">
          {!session && <Link href={session ? "/api/auth/signout" : "/api/auth/signin"}
                className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
                >
                Sign in
            </Link>}
            {session?.user ? (
            <Paper className="p-6 bg-gray-800 w-full">
              {!video && <div>Video not found</div>}
              
              {video && (
                <div className="space-y-4">
                  <h1 className="text-2xl font-bold mb-4">{video.title}</h1>
                  <div>
                    <h2 className="text-lg font-semibold">Video URL</h2>
                    <p>{video.videoUrl}</p>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Status</h2>
                    <Badge color={getStatusColor(video.status)} variant="light">
                      {video.status}
                    </Badge>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Created At</h2>
                    <p>{new Date(video.createdAt!).toLocaleString()}</p>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Last Updated</h2>
                    <p>{new Date(video.updatedAt!).toLocaleString()}</p>
                  </div>
                  {captions.length > 0 && (
                    <>  
                      <h2 className="text-lg font-semibold">Transcription</h2>
                      <TranscriptionAccordion transcription={transcription}/>    
                    </>
                  )}
                  
                  {(transcription && video.status.toLowerCase() === 'completed') && <SummarizeButton 
                    transcription={transcription}
                    isCompleted={video.status.toLowerCase() === 'completed'}
                  />}
                </div>
              )}
            </Paper>
          ) : (
            <div className="text-center">
              <p>Please sign in to view video details</p>
            </div>
          )}
        
        </div>
      </div>
      
    </HydrateClient>
  );
}
