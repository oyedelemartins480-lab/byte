import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageBackdrop } from "@/components/decor";
import { HashIcon, Logo, TimerIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/server";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join a room · Byte" };

type Preview = { id: string; name: string; type: "build" | "lockin"; member_count: number; owner_name: string };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const [{ data: rows }, { data: auth }] = await Promise.all([
    supabase.rpc("room_preview", { code }),
    supabase.auth.getUser(),
  ]);
  const room = (rows as Preview[] | null)?.[0] ?? null;
  const user = auth.user;
  const here = `/join/${code}`;

  if (room && user) {
    const [{ data: member }, { data: profile }] = await Promise.all([
      supabase.from("room_members").select("room_id").eq("room_id", room.id).eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
    ]);
    if (!profile) redirect(`/onboarding?next=${encodeURIComponent(here)}`);
    if (member) redirect(`/app/r/${room.id}`);
  }

  return (
    <div className="isolate flex min-h-dvh flex-col bg-bg">
      <PageBackdrop />
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-6 py-3.5">
        <Link href="/" aria-label="Byte home" className="no-underline">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="rise flex w-full max-w-[420px] flex-col gap-6 rounded-[24px] border border-line bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)]">
          {room ? (
            <>
              <div className="flex flex-col gap-4">
                <span className="flex items-center gap-2 text-sm text-muted">
                  {room.type === "lockin" ? <TimerIcon size={16} /> : <HashIcon size={16} />}
                  {room.type === "lockin" ? "Lock-In Room" : "Build Room"}
                </span>
                <h1 className="m-0 break-words font-display text-[32px] font-extrabold leading-tight tracking-[-0.02em]">
                  {room.name}
                </h1>
                <p className="m-0 text-muted">
                  {room.owner_name} invited you. {room.member_count} {room.member_count === 1 ? "person is" : "people are"} in
                  this room.
                </p>
              </div>
              {user ? (
                <JoinButton code={code} />
              ) : (
                <div className="flex flex-col gap-3">
                  <Link
                    href={`/signup?next=${encodeURIComponent(here)}`}
                    className="btn min-h-12 rounded-xl bg-inv font-semibold text-inv-fg"
                  >
                    Sign up to join
                  </Link>
                  <Link
                    href={`/login?next=${encodeURIComponent(here)}`}
                    className="btn min-h-12 rounded-xl border border-line bg-surface font-medium text-fg"
                  >
                    I already have an account
                  </Link>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="m-0 font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
                  This invite link doesn&apos;t work
                </h1>
                <p className="m-0 text-muted">
                  The room owner may have reset it. Ask them for a fresh link, or start your own room.
                </p>
              </div>
              <Link href={user ? "/app" : "/signup"} className="btn min-h-12 rounded-xl bg-inv font-semibold text-inv-fg">
                {user ? "Go to my rooms" : "Create an account"}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
