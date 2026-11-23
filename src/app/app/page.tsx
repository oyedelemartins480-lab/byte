import { Blob, Spark, Squiggle } from "@/components/decor";
import { HomeActions } from "./home-actions";

export default function AppHome() {
  return (
    <div className="relative isolate flex h-full items-center justify-center overflow-hidden overflow-y-auto p-6">
      <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 -z-10" />
      <Blob variant={0} float className="-right-32 -top-32 -z-10 size-[460px] opacity-80" />
      <Blob variant={2} tone="sunk" className="-bottom-40 -left-32 -z-10 size-[480px]" />
      <div className="flex w-full max-w-[520px] flex-col gap-6">
        <div className="relative flex flex-col gap-2">
          <Squiggle className="-top-7 left-0 h-5 w-24" />
          <Spark tone="fg" className="-right-2 top-0 size-5" />
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-tight tracking-[-0.02em]">Where are we locking in?</h1>
          <p className="m-0 text-lg text-muted">Pick a room on the left, start a new one, or paste an invite link from your team.</p>
        </div>
        <HomeActions />
      </div>
    </div>
  );
}
