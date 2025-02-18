import Link from "next/link";
import { auth } from "~/server/auth";
import {
  IconInbox,
  IconCalendarEvent,
  IconCalendarTime,
  IconChevronDown,
  IconPlus,
} from "@tabler/icons-react";
import { api } from "~/trpc/server";
import { type RouterOutputs } from "~/trpc/react";
type Project = RouterOutputs["project"]["getAll"][0];

export default async function Sidebar() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const projects = await api.project.getAll({
    include: {
      actions: true,
    },
  });

  return (
    <aside className="w-full sm:w-64 border-r border-gray-800 p-4 flex flex-col h-screen bg-[#262626]">
      <nav className="flex-grow space-y-2 mt-12 lg:mt-0">
        <Link href="/" className="pl-3 mb-5 text-xl font-bold">
          🧘‍♂️ Life OS<br/><br/>
        </Link>
        
        <Link
          href="/inbox"
          className="group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          <IconInbox className="mr-3 h-5 w-5" />
          <span>Inbox</span>
          <span className="ml-auto text-gray-500">12</span>
        </Link>
        <Link
          href="/today"
          className="group flex items-center rounded-lg bg-red-900/30 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          <IconCalendarEvent className="mr-3 h-5 w-5" />
          <span>Today</span>
          <span className="ml-auto text-gray-500">1</span>
        </Link>
        <Link
          href="/upcoming"
          className="group flex items-center rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          <IconCalendarTime className="mr-3 h-5 w-5" />
          <span>Upcoming</span>
        </Link>

        <div className="mt-6">
          <div className="flex items-center justify-between px-3 py-2 text-gray-400">
            <span className="text-sm font-medium">My Projects</span>
            <div className="flex items-center gap-2">
              <button className="hover:text-gray-300">
                <IconPlus className="h-4 w-4" />
              </button>
              <button className="hover:text-gray-300">
                <IconChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-1 space-y-1">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.slug}-${project.id}`}
                className="group flex items-center rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800"
              >
                <span className="mr-2 text-gray-500">#</span>
                <span>{project.name}</span>
                <span className="ml-auto text-gray-500">
                  {
                    project.actions.filter(
                      (action) => action.status !== "COMPLETED",
                    )?.length
                  }
                </span>
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="mt-auto border-t border-gray-800 pt-4">
        <Link
          href={"https://github.com/positonic/ai-todo"}
          className="flex w-full items-center rounded-lg px-3 py-2 text-red-400 hover:bg-gray-800"
        >
          <GithubIcon className="h-6 w-6" />
        </Link>
      </div>
      <div className="mt-auto border-t border-gray-800 pt-4">
        <Link
          href={session ? "/api/auth/signout" : "/use-the-force"}
          className="flex w-full items-center rounded-lg px-3 py-2 text-red-400 hover:bg-gray-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="mr-2 h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z"
              clipRule="evenodd"
            />
          </svg>
          {session ? "Sign out" : "Sign in"}
        </Link>
      </div>
    </aside>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
