"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const linkBase = "text-sm font-medium transition-colors";

function linkClass(active: boolean): string {
  return active
    ? `${linkBase} text-white`
    : `${linkBase} text-slate-400 hover:text-slate-100`;
}

export function NavBar() {
  const pathname = usePathname();
  const isChat = pathname === "/";
  const isDashboard = pathname === "/dashboard";

  return (
    <nav className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
      <Link href="/" className="text-lg font-semibold text-white">
        Study Agent
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/" className={linkClass(isChat)}>
          Chat
        </Link>
        <Link href="/dashboard" className={linkClass(isDashboard)}>
          Dashboard
        </Link>
      </div>
    </nav>
  );
}
