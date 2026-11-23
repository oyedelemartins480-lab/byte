import { Fragment } from "react";

const TOKEN_RE = /(https?:\/\/[^\s<>"')\]]+)|(@[a-z0-9_]{3,24})|(`[^`\n]+`)/gi;
const FENCE_RE = /```(?:[a-zA-Z0-9+-]+)?\n?([\s\S]*?)```/g;

/** Renders message text: code fences, inline code, links and @mentions. Never uses innerHTML. */
export function MessageBody({
  text,
  usernames,
  me,
}: {
  text: string;
  usernames: Set<string>;
  me: string;
}) {
  const blocks: { code: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE_RE)) {
    if (m.index > last) blocks.push({ code: false, text: text.slice(last, m.index) });
    blocks.push({ code: true, text: m[1].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) blocks.push({ code: false, text: text.slice(last) });

  return (
    <>
      {blocks.map((b, i) =>
        b.code ? (
          <pre
            key={i}
            className="scroll-thin my-1 max-w-full overflow-x-auto rounded-xl bg-code px-3.5 py-3 font-mono text-[13px] leading-relaxed text-code-fg"
          >
            <code>{b.text}</code>
          </pre>
        ) : (
          <p key={i} className="m-0 whitespace-pre-wrap break-words text-[15px] leading-[1.55]">
            <Inline text={b.text.replace(/^\n+|\n+$/g, "")} usernames={usernames} me={me} />
          </p>
        ),
      )}
    </>
  );
}

function Inline({ text, usernames, me }: { text: string; usernames: Set<string>; me: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [token, url, mention, code] = m;
    if (url) {
      out.push(
        <a key={m.index} href={url} target="_blank" rel="noopener noreferrer" className="break-all text-fg underline underline-offset-2">
          {url}
        </a>,
      );
    } else if (mention) {
      const name = mention.slice(1).toLowerCase();
      if (usernames.has(name)) {
        out.push(
          <span
            key={m.index}
            className={`rounded px-0.5 font-semibold ${name === me ? "bg-hi text-hi-fg" : "text-fg"}`}
          >
            {mention}
          </span>,
        );
      } else out.push(token);
    } else if (code) {
      out.push(
        <code key={m.index} className="rounded-md bg-sunk px-1.5 py-0.5 font-mono text-[13px]">
          {code.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => (typeof n === "string" ? <Fragment key={`t${i}`}>{n}</Fragment> : n))}</>;
}
