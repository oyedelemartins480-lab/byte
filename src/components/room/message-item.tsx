"use client";

import { memo, useState } from "react";
import { QUICK_REACTIONS } from "@/lib/stickers";
import type { FileMeta, GifMeta, Member, Message, StickerMeta } from "@/lib/types";
import { initials } from "@/lib/utils";
import { ReplyIcon, SmileIcon, TrashIcon } from "../icons";
import { FileCard } from "./file-card";
import { MessageBody } from "./message-body";
import { Popover } from "./pickers";

export type ReactionGroup = { emoji: string; count: number; mine: boolean; names: string[] };

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));

type Props = {
  m: Message;
  author?: Member;
  grouped: boolean;
  isMine: boolean;
  reactions: ReactionGroup[];
  reply?: { message: Message; author?: Member };
  usernames: Set<string>;
  meUsername: string;
  onReply: (m: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (m: Message) => void;
  onRetry: (m: Message) => void;
  onJumpTo: (id: string) => void;
};

export const MessageItem = memo(function MessageItem({
  m,
  author,
  grouped,
  isMine,
  reactions,
  reply,
  usernames,
  meUsername,
  onReply,
  onReact,
  onDelete,
  onRetry,
  onJumpTo,
}: Props) {
  const [reacting, setReacting] = useState(false);
  const name = author?.name ?? "Someone who left";

  if (m.type === "system") {
    return (
      <div id={`m-${m.id}`} className="px-3 py-2 text-center text-[13px] text-muted">
        <span className="font-semibold text-fg">{name}</span> {m.body} · {fmtTime(m.created_at)}
      </div>
    );
  }

  const deleted = Boolean(m.deleted_at);

  return (
    <div
      id={`m-${m.id}`}
      className={`msg group relative flex gap-3 rounded-[10px] px-2 ${grouped ? "py-0.5" : "mt-2 py-1.5"} ${
        m.pending ? "opacity-70" : ""
      }`}
    >
      <div className="w-9 shrink-0">
        {!grouped && (
          <span
            aria-hidden="true"
            className={`flex size-9 items-center justify-center rounded-full text-[13px] font-semibold ${
              isMine ? "bg-inv text-inv-fg" : "bg-sunk text-fg"
            }`}
          >
            {initials(name)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">{name}</span>
            <time dateTime={m.created_at} className="text-xs tabular-nums text-muted">
              {fmtTime(m.created_at)}
            </time>
          </div>
        )}

        {reply && (
          <button
            type="button"
            onClick={() => onJumpTo(reply.message.id)}
            className="btn justify-start border-l-2 border-line py-0 pl-2.5 text-left text-[13px] text-muted"
          >
            <span className="truncate">
              <span className="font-semibold">{reply.author?.name ?? "Someone"}:</span>{" "}
              {reply.message.deleted_at ? "Message deleted" : preview(reply.message)}
            </span>
          </button>
        )}

        {deleted ? (
          <p className="m-0 text-[15px] italic text-muted">Message deleted</p>
        ) : (
          <Content m={m} usernames={usernames} meUsername={meUsername} />
        )}

        {m.failed && (
          <p className="m-0 flex items-center gap-2 text-[13px] text-err">
            Didn&apos;t send.
            <button type="button" onClick={() => onRetry(m)} className="btn p-0 text-[13px] font-semibold text-err underline">
              Try again
            </button>
          </p>
        )}

        {reactions.length > 0 && !deleted && (
          <div className="flex flex-wrap gap-1.5">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(m.id, r.emoji)}
                aria-pressed={r.mine}
                title={r.names.join(", ")}
                className={`btn min-h-7 rounded-full border px-2.5 text-[13px] ${
                  r.mine ? "border-fg bg-sunk font-semibold" : "border-line text-muted"
                }`}
              >
                <span>{r.emoji}</span>
                <span className="tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!deleted && !m.pending && !m.failed && (
        <div className="msg-actions absolute -top-3 right-2 flex gap-0.5 rounded-[10px] border border-line bg-surface p-0.5 opacity-0 shadow-sm focus-within:opacity-100">
          <div className="relative">
            <ActionButton label="Add reaction" onClick={() => setReacting((v) => !v)}>
              <SmileIcon size={16} />
            </ActionButton>
            {reacting && (
              <Popover label="Reactions" onClose={() => setReacting(false)} className="!left-auto right-0 flex-row p-1">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={`React with ${e}`}
                    onClick={() => {
                      onReact(m.id, e);
                      setReacting(false);
                    }}
                    className="btn row size-9 rounded-lg text-lg"
                  >
                    {e}
                  </button>
                ))}
              </Popover>
            )}
          </div>
          <ActionButton label="Reply" onClick={() => onReply(m)}>
            <ReplyIcon size={16} />
          </ActionButton>
          {isMine && (
            <ActionButton label="Delete message" onClick={() => onDelete(m)}>
              <TrashIcon size={16} />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
});

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="btn row size-8 rounded-lg text-muted">
      {children}
    </button>
  );
}

function Content({ m, usernames, meUsername }: { m: Message; usernames: Set<string>; meUsername: string }) {
  switch (m.type) {
    case "gif": {
      const g = m.meta as unknown as GifMeta;
      const w = Math.min(280, g.width || 280);
      const h = g.width ? Math.round((w / g.width) * g.height) : 200;
      return (
        // eslint-disable-next-line @next/next/no-img-element -- third-party animated GIF
        <img
          src={g.url}
          alt={g.title ? `GIF: ${g.title}` : "GIF"}
          width={w}
          height={h}
          loading="lazy"
          className="max-w-full rounded-xl bg-sunk"
          style={{ aspectRatio: `${w} / ${h}` }}
        />
      );
    }
    case "sticker": {
      const s = m.meta as unknown as StickerMeta;
      // eslint-disable-next-line @next/next/no-img-element -- local SVG sticker
      return <img src={s.src} alt={`Sticker: ${s.label}`} width={120} height={120} className="size-[120px]" />;
    }
    case "file":
      return <FileCard meta={m.meta as unknown as FileMeta} pending={m.pending} />;
    default:
      return <MessageBody text={m.body} usernames={usernames} me={meUsername} />;
  }
}

export function preview(m: Message) {
  if (m.type === "gif") return "GIF";
  if (m.type === "sticker") return `Sticker: ${(m.meta as unknown as StickerMeta).label}`;
  if (m.type === "file") return `File: ${(m.meta as unknown as FileMeta).name}`;
  return m.body.replace(/```[\s\S]*?```/g, "[code]").slice(0, 140);
}
