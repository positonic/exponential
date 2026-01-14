import Link from "next/link";

export function TodayLinkButton() {
  return (
    <Link
      href="/home"
      className="px-5 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 text-white bg-gradient-to-r from-purple-500 to-blue-500"
    >
      Dashboard
    </Link>
  );
}