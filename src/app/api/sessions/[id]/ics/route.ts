import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545 text escaping
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Lines over 75 octets must be folded.
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  out.push(rest);
  return out.join("\r\n");
};

/** An .ics file for a lock-in session, with a reminder 10 minutes before. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });

  // Row-level security only returns sessions in rooms you're a member of.
  const { data: s } = await supabase
    .from("sessions")
    .select("id, title, starts_at, ends_at, room_id, rooms(name)")
    .eq("id", id)
    .maybeSingle();
  if (!s) return new NextResponse("Not found", { status: 404 });

  const room = (s.rooms as unknown as { name: string } | null)?.name ?? "Byte";
  const url = `${new URL(req.url).origin}/app/r/${s.room_id}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Byte//Lock-in//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${s.id}@byte`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(s.starts_at))}`,
    `DTEND:${stamp(new Date(s.ends_at))}`,
    `SUMMARY:${text(`${s.title} · ${room}`)}`,
    `DESCRIPTION:${text(`Lock-in on Byte. Drop your goal when it starts: ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${text(`${s.title} starts in 10 minutes`)}`,
    "TRIGGER:-PT10M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold);

  const file = `${s.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "lock-in"}.ics`;
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
