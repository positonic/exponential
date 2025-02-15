import Link from "next/link";

//import { LatestPost } from "~/app/_components/post";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
export default async function Home() {
  const session = await auth();

  if (session?.user) {
    void api.post.getLatest.prefetch();
  }

  return (
    <HydrateClient>
      <main className="min-h-screen w-full bg-gradient-to-b from-[#111111] to-[#212121] text-white">       
         <div className="container mx-auto px-4 py-16 w-full">
          {session?.user && <Actions />}
          {/* {session?.user && <LatestPost />} */}
        </div>
      </main>
    </HydrateClient>
  );
}
