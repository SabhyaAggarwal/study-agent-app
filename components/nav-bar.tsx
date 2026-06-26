"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

const linkBase = "text-sm font-medium transition-colors";

function linkClass(active: boolean): string {
  return active
    ? `${linkBase} text-white`
    : `${linkBase} text-slate-400 hover:text-slate-100`;
}

export function NavBar() {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

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
        {isSignedIn ? (
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "size-7",
              },
            }}
          />
        ) : (
          <div className="flex items-center gap-3">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Sign up
              </button>
            </SignUpButton>
          </div>
        )}
      </div>
    </nav>
  );
}
