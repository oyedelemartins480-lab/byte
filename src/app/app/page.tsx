import { HomeActions } from "./home-actions";

export default function AppHome() {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-[520px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[36px] font-bold leading-tight tracking-[-0.03em]">Where are we locking in?</h1>
          <p className="m-0 text-lg text-muted">Pick a room on the left, start a new one, or paste an invite link from your team.</p>
        </div>
        <HomeActions />
      </div>
    </div>
  );
}
