import { auth } from "~/server/auth";
import { VideosList } from "./components/VideosList";
import Link from "next/link";
//import VideoSearch from "~/app/_components/VideoSearch";

export default async function VideosPage() {
  const session = await auth();

  return (

    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        {!session && <Link href={session ? "/api/auth/signout" : "/api/auth/signin"}
                className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
                >
                Sign in
            </Link>}
            {session?.user && (
                <div className="w-full">
                    <h1 className="text-2xl font-bold mb-6">Videos</h1>
                    {/* <VideoSearch /> */}
                    <VideosList />
                </div>
                    
        
            )}
        
        </div>
    </div>
        
  );
} 