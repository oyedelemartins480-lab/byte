"use client";

import { memo, useState } from "react";
import { GOAL_MET_LABEL } from "@/lib/session";
import { QUICK_REACTIONS } from "@/lib/stickers";
import type { FileMeta, GifMeta, Member, Message, Recap, StickerMeta, VoiceMeta } from "@/lib/types";
import { initials, isRecent } from "@/lib/utils";
import { ReplyIcon, SmileIcon, TrashIcon } from "../icons";
import { RecapCard } from "../session/recap-card";
import { FileCard } from "./file-card";
import { MessageBody } from "./message-body";
import { Popover } from "./pickers";
import { VoiceCard } from "./voice-card";

export type ReactionGroup = { emoji: string; count: number; mine: boolean; names: string[] };

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));

const DELETABLE = new Set(["text", "gif", "sticker", "file", "voice"]);
const BOT_TYPES = new Set(["ai", "recap"]);

type Props = {
  m: Message;
  author?: Member;
  grouped: boolean;
  isMine: boolean;
  reactions: ReactionGroup[];
  reply?: { message: Message; author?: Member };
  usernames: Set<string>;
  meUsername: string;
  calm: boolean;
  transcribeOn: boolean;
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
  calm,
  transcribeOn,
  onReply,
  onReact,
  onDelete,
  onRetry,
  onJumpTo,
}: Props) {
  const [reacting, setReacting] = useState(false);
  const bot = BOT_TYPES.has(m.type);
  const name = bot ? "Byte AI" : author?.name ?? "Someone who left";

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
              bot ? "rounded-[10px] bg-inv font-mono text-inv-fg" : isMine ? "bg-inv text-inv-fg" : "bg-sunk text-fg"
            }`}
          >
            {bot ? "b" : initials(name)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">{name}</span>
            {bot && <span className="rounded-full border border-line px-1.5 py-px text-[11px] text-muted">AI</span>}
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
              <span className="font-semibold">{reply.message.user_id ? reply.author?.name ?? "Someone" : "Byte AI"}:</span>{" "}
              {reply.message.deleted_at ? "Message deleted" : preview(reply.message)}
            </span>
          </button>
        )}

        {deleted ? (
          <p className="m-0 text-[15px] italic text-muted">Message deleted</p>
        ) : (
          <Content m={m} usernames={usernames} meUsername={meUsername} calm={calm} transcribeOn={transcribeOn} />
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
          {isMine && DELETABLE.has(m.type) && (
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

function Tag({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`mr-2 inline-flex rounded-full px-2 py-0.5 align-[1px] text-[11px] font-semibold uppercase tracking-[0.04em] ${
        strong ? "bg-hi text-hi-fg" : "bg-sunk text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Collapsed({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  if (show) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setShow(true)}
      className="btn min-h-9 self-start rounded-lg border border-dashed border-line px-3 text-[13px] text-muted"
    >
      {label} · calm mode hid it, tap to show
    </button>
  );
}

function Content({
  m,
  usernames,
  meUsername,
  calm,
  transcribeOn,
}: {
  m: Message;
  usernames: Set<string>;
  meUsername: string;
  calm: boolean;
  transcribeOn: boolean;
}) {
  const meta = m.meta as Record<string, unknown>;
  switch (m.type) {
    case "gif": {
      const g = meta as unknown as GifMeta;
      const w = Math.min(280, g.width || 280);
      const h = g.width ? Math.round((w / g.width) * g.height) : 200;
      const img = (
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
      return calm ? <Collapsed label="GIF">{img}</Collapsed> : img;
    }
    case "sticker": {
      const s = meta as unknown as StickerMeta;
      // eslint-disable-next-line @next/next/no-img-element -- local SVG sticker
      const img = <img src={s.src} alt={`Sticker: ${s.label}`} width={120} height={120} className="size-[120px]" />;
      return calm ? <Collapsed label={`Sticker: ${s.label}`}>{img}</Collapsed> : img;
    }
    case "file":
      return <FileCard meta={meta as unknown as FileMeta} pending={m.pending} />;
    case "voice": {
      const v = meta as unknown as VoiceMeta;
      const recent = isRecent(m.created_at, 3 * 60_000);
      return <VoiceCard meta={v} pending={m.pending} transcribing={transcribeOn && !v.transcript && recent} />;
    }
    case "checkin":
      return (
        <p className="m-0 text-[15px] leading-[1.55]">
          <Tag strong>Goal</Tag>
          {m.body}
        </p>
      );
    case "progress":
      return (
        <p className="m-0 text-[15px] leading-[1.55]">
          <Tag>Update</Tag>
          {m.body}
        </p>
      );
    case "done":
      return (
        <p className="m-0 text-[15px] leading-[1.55]">
          <Tag strong>Done · {GOAL_MET_LABEL[((meta.goal_met as "yes" | "partly" | "no") ?? "no")]}</Tag>
          {m.body}
        </p>
      );
    case "recap":
      return <RecapCard recap={meta as unknown as Recap} />;
    default:
      return <MessageBody text={m.body} usernames={usernames} me={meUsername} />;
  }
}

export function preview(m: Message) {
  const meta = m.meta as Record<string, unknown>;
  if (m.type === "gif") return "GIF";
  if (m.type === "sticker") return `Sticker: ${(meta as unknown as StickerMeta).label}`;
  if (m.type === "file") return `File: ${(meta as unknown as FileMeta).name}`;
  if (m.type === "voice") return "Voice note";
  if (m.type === "recap") return "Session recap";
  return m.body.replace(/```[\s\S]*?```/g, "[code]").slice(0, 140);
}
