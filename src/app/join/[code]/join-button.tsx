"use client";

import { useState, useTransition } from "react";
import { joinRoom } from "@/app/actions";
import { Spinner } from "@/components/setup-chat";

export function JoinButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await joinRoom(code);
            if (res?.error) setError(res.error);
          })
        }
        className="btn min-h-12 rounded-xl bg-inv font-semibold text-inv-fg"
      >
        {pending ? (
          <>
            <Spinner /> Joining…
          </>
        ) : (
          "Join the room"
        )}
      </button>
      {error && (
        <p role="alert" className="m-0 text-sm text-err">
          {error}
        </p>
      )}
    </div>
  );
}
