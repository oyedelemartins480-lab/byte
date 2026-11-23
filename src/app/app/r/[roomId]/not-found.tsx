import Link from "next/link";

export default function RoomNotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-[420px] flex-col gap-4">
        <h1 className="m-0 font-display text-3xl font-extrabold tracking-[-0.02em]">You&apos;re not in this room</h1>
        <p className="m-0 text-muted">
          It may have been deleted, or you haven&apos;t joined yet. Ask someone in the room for its invite link.
        </p>
        <Link href="/app" className="btn min-h-11 self-start rounded-[10px] bg-inv px-5 font-semibold text-inv-fg">
          Back to my rooms
        </Link>
      </div>
    </div>
  );
}
