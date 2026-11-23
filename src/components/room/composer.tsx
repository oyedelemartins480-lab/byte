"use client";

import { useRef, useState } from "react";
import type { GifMeta, Member, Message, StickerMeta } from "@/lib/types";
import { CodeIcon, PaperclipIcon, ArrowRightIcon, SmileIcon, XIcon } from "../icons";
import { preview } from "./message-item";
import { GifPicker, StickerPicker } from "./pickers";

const MENTION_RE = /(^|\s)@([a-z0-9_]{0,24})$/i;

export function Composer({
  roomName,
  members,
  meId,
  replyTo,
  replyAuthor,
  onCancelReply,
  onSend,
  onGif,
  onSticker,
  onFiles,
  onTyping,
}: {
  roomName: string;
  members: Member[];
  meId: string;
  replyTo: Message | null;
  replyAuthor?: Member;
  onCancelReply: () => void;
  onSend: (text: string) => void;
  onGif: (g: GifMeta) => void;
  onSticker: (s: StickerMeta) => void;
  onFiles: (files: FileList) => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<null | "gif" | "sticker">(null);
  const [mention, setMention] = useState<{ query: string; index: number } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const matches = mention
    ? members
        .filter((m) => m.id !== meId)
        .filter(
          (m) =>
            m.username.startsWith(mention.query.toLowerCase()) ||
            m.name.toLowerCase().startsWith(mention.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  function resize() {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function updateMention(value: string, caret: number) {
    const m = value.slice(0, caret).match(MENTION_RE);
    setMention(m ? { query: m[2], index: 0 } : null);
  }

  function insertMention(username: string) {
    const el = ta.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = text.slice(0, caret).replace(MENTION_RE, (_all, space) => `${space}@${username} `);
    const next = before + text.slice(caret);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
      resize();
    });
  }

  function submit() {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText("");
    setMention(null);
    requestAnimationFrame(resize);
  }

  function wrapCode() {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = text.slice(s, e);
    const block = sel.includes("\n") || !sel ? `\n\`\`\`\n${sel}\n\`\`\`\n` : `\`${sel}\``;
    const next = text.slice(0, s) + block + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = sel ? s + block.length : s + 5;
      el.setSelectionRange(pos, pos);
      resize();
    });
  }

  return (
    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
      {replyTo && (
        <div className="flex items-center gap-2 rounded-t-[14px] border border-b-0 border-line bg-sunk px-3 py-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate text-muted">
            Replying to <span className="font-semibold text-fg">{replyAuthor?.name ?? "Someone"}</span>: {preview(replyTo)}
          </span>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="btn size-7 rounded-md text-muted">
            <XIcon size={14} />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`relative flex flex-col gap-1.5 border border-line bg-surface p-2 transition-colors focus-within:border-fg ${
          replyTo ? "rounded-b-[14px]" : "rounded-[14px]"
        }`}
      >
        {mention && matches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention someone"
            className="rise absolute bottom-full left-2 z-20 mb-2 m-0 w-[min(280px,calc(100%-16px))] list-none overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
          >
            {matches.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === mention.index}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(m.username)}
                  className={`btn row w-full justify-start rounded-lg px-2.5 py-2 text-left text-sm ${
                    i === mention.index ? "bg-sunk" : ""
                  }`}
                >
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-muted">@{m.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="composer" className="sr-only">
          Message {roomName}
        </label>
        <textarea
          id="composer"
          ref={ta}
          rows={1}
          value={text}
          placeholder={`Message ${roomName}`}
          onChange={(e) => {
            setText(e.target.value);
            updateMention(e.target.value, e.target.selectionStart);
            resize();
            if (e.target.value) onTyping();
          }}
          onKeyDown={(e) => {
            if (mention && matches.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const d = e.key === "ArrowDown" ? 1 : -1;
                setMention({ ...mention, index: (mention.index + d + matches.length) % matches.length });
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insertMention(matches[mention.index].username);
                return;
              }
              if (e.key === "Escape") {
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              onFiles(e.clipboardData.files);
            }
          }}
          className="max-h-[200px] min-h-10 resize-none border-0 bg-transparent px-2 py-2 text-base leading-normal text-fg outline-none placeholder:text-muted"
        />

        <div className="flex items-center gap-0.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              if (e.target.files?.length) onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <ToolButton label="Attach a file" onClick={() => fileRef.current?.click()}>
            <PaperclipIcon size={18} />
          </ToolButton>
          <div className="relative">
            <ToolButton label="Add a GIF" onClick={() => setPicker(picker === "gif" ? null : "gif")} pressed={picker === "gif"}>
              <span className="font-mono text-xs font-semibold">GIF</span>
            </ToolButton>
            {picker === "gif" && (
              <GifPicker
                onClose={() => setPicker(null)}
                onPick={(g) => {
                  onGif(g);
                  setPicker(null);
                }}
              />
            )}
          </div>
          <div className="relative">
            <ToolButton
              label="Add a sticker"
              onClick={() => setPicker(picker === "sticker" ? null : "sticker")}
              pressed={picker === "sticker"}
            >
              <SmileIcon size={18} />
            </ToolButton>
            {picker === "sticker" && (
              <StickerPicker
                onClose={() => setPicker(null)}
                onPick={(s) => {
                  onSticker(s);
                  setPicker(null);
                }}
              />
            )}
          </div>
          <ToolButton label="Format as code" onClick={wrapCode}>
            <CodeIcon size={18} />
          </ToolButton>
          <span className="hidden flex-1 pr-2 text-right text-xs text-muted sm:block">
            Enter to send · Shift + Enter for a new line
          </span>
          <span className="flex-1 sm:hidden" />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!text.trim()}
            className="btn size-10 shrink-0 rounded-[10px] bg-inv text-inv-fg"
          >
            <ArrowRightIcon />
          </button>
        </div>
      </form>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`btn row h-9 min-w-9 rounded-lg px-1.5 text-muted ${pressed ? "bg-sunk text-fg" : ""}`}
    >
      {children}
    </button>
  );
}
