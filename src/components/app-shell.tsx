"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setCalmMode, signOut } from "@/app/actions";
import type { Profile } from "@/lib/supabase/server";
import type { SidebarRoom } from "@/lib/types";
import { initials } from "@/lib/utils";
import { ChartIcon, CompassIcon, HashIcon, LeafIcon, LogoutIcon, Logo, MenuIcon, PlusIcon, TimerIcon, XIcon } from "./icons";
import { NewRoomDialog } from "./new-room-dialog";
import { ThemeToggle } from "./theme-provider";

export function AppShell({
  profile,
  rooms,
  streak,
  children,
}: {
  profile: Profile;
  rooms: SidebarRoom[];
  streak: number;
  children: React.ReactNode;
}) {
  const [calmPending, startCalm] = useTransition();
  const [calm, setCalm] = useState(Boolean(profile.calm_mode));
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "build" | "lockin">(null);

  // Close the mobile drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setNavOpen(false);
  }

  useEffect(() => {
    const open = (e: Event) => setDialog((e as CustomEvent<"build" | "lockin">).detail ?? "build");
    window.addEventListener("byte:new-room", open);
    return () => window.removeEventListener("byte:new-room", open);
  }, []);

  const lockins = rooms.filter((r) => r.type === "lockin");
  const builds = rooms.filter((r) => r.type === "build");

  const nav = (
    <nav aria-label="Rooms" className="flex h-full flex-col gap-5 px-2.5 py-3.5">
      <div className="flex items-center justify-between px-2">
        <Link href="/app" className="no-underline" aria-label="Byte home">
          <Logo />
        </Link>
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="btn size-10 rounded-lg text-muted md:hidden"
        >
          <XIcon />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {(
          [
            ["/app/discover", "Discover open rooms", <CompassIcon key="d" size={16} />],
            ["/app/me", "Your stats", <ChartIcon key="s" size={16} />],
          ] as const
        ).map(([href, label, icon]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`row flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm text-fg no-underline ${
              pathname === href ? "bg-sunk font-semibold" : ""
            }`}
          >
            <span className="text-muted">{icon}</span>
            {label}
          </Link>
        ))}
      </div>

      <div className="scroll-thin flex flex-1 flex-col gap-5 overflow-y-auto">
        <RoomGroup
          title="Lock-in rooms"
          rooms={lockins}
          pathname={pathname}
          icon={<TimerIcon size={16} />}
          onAdd={() => setDialog("lockin")}
          empty="Lock in with your people on a timer."
        />
        <RoomGroup
          title="Build rooms"
          rooms={builds}
          pathname={pathname}
          icon={<HashIcon size={16} />}
          onAdd={() => setDialog("build")}
          empty="One room per project."
        />
        <button
          type="button"
          onClick={() => setDialog("build")}
          className="btn min-h-10 justify-start rounded-[10px] border border-dashed border-line px-2.5 text-sm font-medium text-muted"
        >
          <PlusIcon size={16} /> New room
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={calm}
        disabled={calmPending}
        onClick={() => {
          const next = !calm;
          setCalm(next);
          startCalm(async () => {
            const res = await setCalmMode(next);
            if (res?.error) setCalm(!next);
          });
        }}
        title="Calm mode hides typing indicators and folds away GIFs and stickers"
        className={`btn row min-h-10 justify-start gap-2.5 rounded-[10px] px-2.5 text-sm ${calm ? "bg-sunk font-semibold text-fg" : "text-muted"}`}
      >
        <LeafIcon size={16} />
        <span className="flex-1 text-left">Calm mode</span>
        <span className="text-xs">{calm ? "On" : "Off"}</span>
      </button>

      <div className="flex items-center gap-2.5 rounded-xl border border-line p-2.5">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-inv text-[13px] font-semibold text-inv-fg">
          {initials(profile.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{profile.name}</span>
          <Link href="/app/me" className="truncate text-xs text-muted no-underline hover:underline">
            {streak > 0 ? `${streak}-day streak` : `@${profile.username}`}
          </Link>
        </div>
        <ThemeToggle className="!size-9 !rounded-lg" />
        <form action={signOut}>
          <button type="submit" aria-label="Log out" title="Log out" className="btn size-9 rounded-lg border border-line text-muted">
            <LogoutIcon size={16} />
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <aside className="hidden w-[264px] shrink-0 border-r border-line bg-surface md:block">{nav}</aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setNavOpen(false)}
          />
          <aside className="rise absolute inset-y-0 left-0 w-[284px] max-w-[85vw] border-r border-line bg-surface">{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setNavOpen(true)} className="btn size-10 rounded-lg text-fg">
            <MenuIcon />
          </button>
          <Logo withWord />
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>

      <NewRoomDialog type={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function RoomGroup({
  title,
  rooms,
  pathname,
  icon,
  onAdd,
  empty,
}: {
  title: string;
  rooms: SidebarRoom[];
  pathname: string;
  icon: React.ReactNode;
  onAdd: () => void;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2.5 py-1">
        <span className="text-[13px] text-muted">{title}</span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`New ${title.toLowerCase().replace(/s$/, "")}`}
          className="btn row size-7 rounded-md text-muted"
        >
          <PlusIcon size={15} />
        </button>
      </div>
      {rooms.length === 0 && <p className="m-0 px-2.5 py-1 text-[13px] text-muted">{empty}</p>}
      {rooms.map((r) => {
        const active = pathname === `/app/r/${r.id}`;
        return (
          <Link
            key={r.id}
            href={`/app/r/${r.id}`}
            aria-current={active ? "page" : undefined}
            className={`row flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm text-fg no-underline ${
              active ? "bg-sunk font-semibold" : ""
            }`}
          >
            <span className="shrink-0 text-muted">{icon}</span>
            <span className="truncate">{r.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
