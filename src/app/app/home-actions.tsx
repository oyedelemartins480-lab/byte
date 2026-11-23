"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HashIcon, TimerIcon } from "@/components/icons";
import { parseInviteCode } from "@/lib/utils";

export function HomeActions() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const open = (type: "build" | "lockin") => window.dispatchEvent(new CustomEvent("byte:new-room", { detail: type }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => open("lockin")}
          className="btn flex-col items-start gap-1 rounded-2xl bg-inv p-5 text-left text-inv-fg"
        >
          <span className="flex items-center gap-2 font-semibold">
            <TimerIcon size={16} /> Start a lock-in room
          </span>
          <span className="text-sm opacity-80">Everyone on their own goal, together</span>
        </button>
        <button
          type="button"
          onClick={() => open("build")}
          className="btn flex-col items-start gap-1 rounded-2xl border border-line bg-surface p-5 text-left text-fg"
        >
          <span className="flex items-center gap-2 font-semibold">
            <HashIcon size={16} /> Start a build room
          </span>
          <span className="text-sm text-muted">One project, one team</span>
        </button>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const code = parseInviteCode(link);
          if (!code) return setError("That doesn't look like a Byte invite link. It should end in /join/ and a code.");
          router.push(`/join/${code}`);
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="home-invite" className="text-sm font-medium">
          Have an invite link?
        </label>
        <div className="flex gap-2">
          <input
            id="home-invite"
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError("");
            }}
            placeholder="https://…/join/…"
            aria-invalid={Boolean(error)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
          />
          <button type="submit" className="btn min-h-12 rounded-xl border border-line bg-surface px-5 font-semibold text-fg">
            Join
          </button>
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-err">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
