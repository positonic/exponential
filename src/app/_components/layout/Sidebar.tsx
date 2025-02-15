import Link from "next/link";
import { auth } from "~/server/auth";

export default async function Sidebar() {
  const session = await auth();

  return (
    <aside className="w-64 border-r border-gray-800 p-4 flex flex-col h-[calc(100vh-64px)]">
      <nav className="space-y-2 flex-grow">
        <Link
          href="/"
          className="block rounded-lg px-3 py-2 text-blue-400 hover:bg-gray-800"
        >
          Actions
        </Link>
        <Link
          href="/projects"
          className="block rounded-lg px-3 py-2 hover:bg-gray-800"
        >
          Projects
        </Link>
        <Link
          href="/outcomes"
          className="block rounded-lg px-3 py-2 hover:bg-gray-800"
        >
          Outcomes
        </Link>
      </nav>
      
      <div className="mt-auto pt-4 border-t border-gray-800">
        <Link
          href={session ? "/api/auth/signout" : "/api/auth/signin"}
          className="flex items-center w-full rounded-lg px-3 py-2 text-red-400 hover:bg-gray-800"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 20 20" 
            fill="currentColor" 
            className="w-5 h-5 mr-2"
          >
            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
          </svg>
          {session ? "Sign out" : "Sign in"}
        </Link>
      </div>
    </aside>
  );
}

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
} 