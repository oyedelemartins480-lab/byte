"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRoom } from "@/app/actions";
import { HashIcon, TimerIcon, XIcon } from "./icons";
import { Spinner } from "./setup-chat";

export function NewRoomDialog({ type, onClose }: { type: null | "build" | "lockin"; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"build" | "lockin">("build");
  const [state, action, pending] = useActionState(createRoom, undefined);

  // Sync the requested type into local state when the dialog opens.
  const [lastType, setLastType] = useState(type);
  if (type !== lastType) {
    setLastType(type);
    if (type) setKind(type);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (type && !d.open) d.showModal();
    if (!type && d.open) d.close();
  }, [type]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      <form action={action} className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="m-0 font-display text-2xl font-extrabold tracking-[-0.02em]">New room</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="btn size-9 rounded-lg text-muted">
            <XIcon />
          </button>
        </div>

        <fieldset className="m-0 grid grid-cols-2 gap-2 border-0 p-0">
          <legend className="sr-only">Room type</legend>
          {(
            [
              ["build", "Build room", "One project, one team", <HashIcon key="b" size={16} />],
              ["lockin", "Lock-in room", "Own goals, together", <TimerIcon key="l" size={16} />],
            ] as const
          ).map(([value, label, hint, icon]) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 ${
                kind === value ? "border-fg bg-sunk" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="type"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-sm font-semibold">
                {icon} {label}
              </span>
              <span className="text-[13px] text-muted">{hint}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="room-name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="room-name"
            name="name"
            required
            maxLength={60}
            autoComplete="off"
            placeholder={kind === "lockin" ? "Morning lock-in" : "byte-frontend"}
            className="min-h-12 rounded-xl border border-line bg-bg px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" name="public" className="mt-1 size-4 accent-[var(--fg)]" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Open to everyone</span>
            <span className="text-[13px] text-muted">
              Shows in Discover so anyone on Byte can join and lock in with you. You can change this later.
            </span>
          </span>
        </label>

        {state?.error && (
          <p role="alert" className="m-0 text-sm text-err">
            {state.error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn min-h-11 rounded-[10px] px-4 font-medium text-fg">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn min-h-11 rounded-[10px] bg-inv px-5 font-semibold text-inv-fg">
            {pending ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              "Create room"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
