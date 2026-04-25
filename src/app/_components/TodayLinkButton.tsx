import Link from "next/link";

export function TodayLinkButton() {
  return (
    <Link
      href="/home"
      className="px-5 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-all hover:shadow-lg text-white bg-brand-primary hover:bg-brand-primary-hover"
    >
      Dashboard
    </Link>
  );
}