"use client";

import { useState, useTransition } from "react";
import { joinPublicRoom } from "@/app/actions";
import { Spinner } from "@/components/setup-chat";

export function JoinPublicButton({ roomId }: { roomId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await joinPublicRoom(roomId);
            if (res?.error) setError(res.error);
          })
        }
        className="btn min-h-11 rounded-[10px] bg-inv font-semibold text-inv-fg"
      >
        {pending ? <Spinner /> : null} Join room
      </button>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-err">
          {error}
        </p>
      )}
    </div>
  );
}
