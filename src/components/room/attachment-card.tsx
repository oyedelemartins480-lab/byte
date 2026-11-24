import type { Attachment } from "@/lib/types";

const DRIVE_KIND: [RegExp, string, string, string][] = [
  [/document/, "Google Doc", "D", "bg-[#2f6fe4] text-white"],
  [/spreadsheet/, "Google Sheet", "S", "bg-[#1e8e3e] text-white"],
  [/presentation/, "Google Slides", "P", "bg-[#f4b400] text-black"],
  [/form/, "Google Form", "F", "bg-[#7248b9] text-white"],
  [/pdf/, "PDF", "PDF", "bg-[#d93025] text-white"],
  [/folder/, "Folder", "▣", "bg-sunk text-fg"],
  [/image/, "Image", "▨", "bg-sunk text-fg"],
  [/video/, "Video", "▶", "bg-sunk text-fg"],
];

function driveKind(mime = "") {
  for (const [re, label, letter, cls] of DRIVE_KIND) if (re.test(mime)) return { label, letter, cls };
  return { label: "Drive file", letter: "▲", cls: "bg-sunk text-fg" };
}

/** Card for a Drive file or Notion page someone shared from the composer. */
export function AttachmentCard({ a }: { a: Attachment }) {
  const isNotion = a.source === "notion";
  const k = isNotion ? { label: a.kind === "database" ? "Notion database" : "Notion page", letter: "N", cls: "bg-fg text-bg" } : driveKind(a.mime);
  const emoji = isNotion && a.icon && !/^https:\/\//.test(a.icon) ? a.icon : null;
  const img = a.icon && /^https:\/\//.test(a.icon) ? a.icon : null;
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="row flex max-w-[460px] items-center gap-3 rounded-xl border border-line bg-surface p-3 text-fg no-underline"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg font-bold ${emoji || img ? "bg-sunk" : k.cls}`}>
        {emoji ? (
          <span aria-hidden="true">{emoji}</span>
        ) : img ? (
          // eslint-disable-next-line @next/next/no-img-element -- icon from Google or Notion
          <img src={img} alt="" width={20} height={20} referrerPolicy="no-referrer" className="size-5 object-contain" />
        ) : (
          <span aria-hidden="true" className={isNotion ? "font-serif" : k.letter.length > 1 ? "text-[11px]" : "text-sm"}>
            {k.letter}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{a.title}</span>
        <span className="truncate text-xs text-muted">
          {k.label} · {isNotion ? "Opens in Notion" : "Opens in Google Drive"}
        </span>
      </span>
    </a>
  );
}
