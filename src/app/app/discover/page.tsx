import type { Metadata } from "next";
import Link from "next/link";
import { HashIcon, TimerIcon } from "@/components/icons";
import { Blob, Squiggle } from "@/components/decor";
import { getSession } from "@/lib/supabase/server";
import { JoinPublicButton } from "./join-public-button";

export const metadata: Metadata = { title: "Discover · Byte" };

type PublicRoom = { id: string; name: string; type: "build" | "lockin"; member_count: number; live: boolean; joined: boolean };

export default async function DiscoverPage() {
  const { supabase } = await getSession();
  const { data, error } = await supabase.rpc("list_public_rooms");
  const rooms = (data ?? []) as PublicRoom[];

  return (
    <div className="scroll-thin relative isolate h-full overflow-y-auto overflow-x-hidden">
      <Blob variant={1} float className="-right-28 -top-28 -z-10 size-[360px] opacity-80" />
      <Blob variant={3} outline tone="line" className="right-[18%] top-24 -z-10 size-[180px]" />
      <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="relative flex flex-col gap-2 pt-4">
          <Squiggle className="left-0 top-0 h-4 w-20" />
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-tight tracking-[-0.02em]">Open rooms</h1>
          <p className="m-0 max-w-[60ch] text-muted">
            Lock in next to people you haven&apos;t met yet. Drop your own goal, check in, and finish together. Open your own
            room to everyone from its settings.
          </p>
        </header>

        {error && <p role="alert" className="m-0 text-err">Couldn&apos;t load rooms: {error.message}</p>}

        {rooms.length === 0 ? (
          <p className="m-0 rounded-2xl border border-dashed border-line p-6 text-muted">
            No open rooms yet. Create a lock-in room and tick &ldquo;Open to everyone&rdquo; to be the first.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {rooms.map((r) => (
              <li key={r.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <span className="shrink-0 text-muted">{r.type === "lockin" ? <TimerIcon size={16} /> : <HashIcon size={16} />}</span>
                    <span className="truncate">{r.name}</span>
                  </span>
                  {r.live && (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-hi px-2 py-0.5 text-[11px] font-semibold text-hi-fg">
                      <span className="size-1.5 rounded-full bg-live" /> Live now
                    </span>
                  )}
                </div>
                <span className="text-sm text-muted">
                  {r.member_count} {r.member_count === 1 ? "member" : "members"}
                </span>
                {r.joined ? (
                  <Link href={`/app/r/${r.id}`} className="btn min-h-11 rounded-[10px] border border-line font-medium text-fg">
                    Open
                  </Link>
                ) : (
                  <JoinPublicButton roomId={r.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
