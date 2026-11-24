import { RECAP_SYSTEM, aiReady, chat, parseNotes, transcript } from "@/lib/ai";
import { focusPct, sessionEnd } from "@/lib/session";
import { adminKey, createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE, json, sessionForUser } from "@/lib/server-guards";
import type { Message, Participant, Recap, Session, SessionSummary } from "@/lib/types";
import { extractLinks } from "@/lib/utils";

const RECAP_TYPES = ["text", "checkin", "progress", "done", "file", "voice", "integration"];

/**
 * Scores the session and posts the recap card. Works without AI too: then the recap
 * is built from goals, drops and the focus score alone.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: "Bad session id." }, 400);
  if (!adminKey()) return json({ error: "Recaps need SUPABASE_SECRET_KEY on the server." }, 503);

  const ctx = await sessionForUser(id);
  if ("error" in ctx) return ctx.error;
  const { session, room } = ctx;
  const end = sessionEnd(session);
  if (Date.now() < end) return json({ error: "The session is still running." }, 409);
  if (session.recap_status === "done") return json({ skipped: "Recap already posted." }, 202);

  const admin = createAdminClient();
  const { data: claimed } = await admin.rpc("claim_ai_job", { sid: id, job: "recap" });
  if (!claimed) return json({ skipped: "Another recap is being written." }, 202);

  try {
    const { error: finErr } = await admin.rpc("finalize_session", { sid: id });
    if (finErr) throw new Error(finErr.message);

    const [{ data: s }, { data: parts }, { data: sum }, { data: rows }] = await Promise.all([
      admin.from("sessions").select("*").eq("id", id).single(),
      admin.from("session_participants").select("*").eq("session_id", id).not("goal", "is", null),
      admin.from("session_summaries").select("*").eq("session_id", id).maybeSingle(),
      admin
        .from("messages")
        .select("*")
        .eq("room_id", session.room_id)
        .in("type", RECAP_TYPES)
        .gte("created_at", session.starts_at)
        .lte("created_at", new Date(end + 20 * 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(400),
    ]);
    const fresh = s as Session;
    const participants = (parts ?? []) as Participant[];
    const summary = sum as SessionSummary | null;
    const messages = ((rows ?? []) as Message[]).reverse();

    const ids = Array.from(
      new Set([fresh.created_by, ...participants.map((p) => p.user_id), ...messages.map((m) => m.user_id)].filter(Boolean)),
    ) as string[];
    const { data: profiles } = await admin.from("profiles").select("id, name, timezone").in("id", ids);
    const names = new Map((profiles ?? []).map((p) => [p.id as string, p.name as string]));
    const tz = ((profiles ?? []).find((p) => p.id === fresh.created_by)?.timezone as string) || "UTC";

    const people = participants.map((p) => ({
      user_id: p.user_id,
      name: names.get(p.user_id) ?? "Someone",
      goal: p.goal,
      done: p.done_text,
      goal_met: p.goal_met,
      focus_pct: focusPct(p),
      score: p.focus_score,
      pages_read: p.goal_kind === "reading" ? (p.pages_read ?? 0) : null,
      pages_total: p.goal_kind === "reading" ? (p.pages_total ?? null) : null,
    }));
    const links = Array.from(
      new Set(messages.filter((m) => m.type === "text" && !m.deleted_at).flatMap((m) => extractLinks(m.body))),
    ).slice(0, 12);

    const hit = people.filter((p) => p.goal_met === "yes").length;
    let notes = {
      summary:
        people.length === 0
          ? "Nobody dropped a goal this time, so there's nothing to score."
          : `${hit} of ${people.length} ${people.length === 1 ? "person" : "people"} hit their goal${
              fresh.team_score !== null ? `, and the team scored ${fresh.team_score}` : ""
            }.`,
      decisions: summary?.extracted.decisions ?? [],
      tasks: summary?.extracted.tasks ?? [],
      blockers: summary?.extracted.blockers ?? [],
    };
    let usedAi = false;

    if (aiReady() && room.ai_enabled && (people.length || messages.length)) {
      try {
        const goals = people
          .map(
            (p) =>
              `- ${p.name}: goal "${p.goal}"; finished: ${p.done ? `"${p.done}"` : "(didn't drop)"}; hit goal: ${
                p.goal_met ?? "unknown"
              }; focus ${p.focus_pct ?? "?"}%${p.pages_total ? `; reading, reached page ${p.pages_read} of ${p.pages_total}` : ""}`,
          )
          .join("\n");
        const text = await chat({
          system: RECAP_SYSTEM,
          model: undefined,
          maxTokens: 700,
          user: `Session "${fresh.title}" (${Math.round((end - new Date(fresh.starts_at).getTime()) / 60000)} minutes). Team score: ${
            fresh.team_score ?? "n/a"
          }.\n\nGoals vs done:\n${goals || "(none)"}\n\nRunning notes:\n${
            summary ? JSON.stringify({ summary: summary.summary, ...summary.extracted }) : "(none)"
          }\n\nLast messages:\n${transcript(messages.slice(-80), names, tz)}`,
        });
        const parsed = parseNotes(text);
        if (parsed.summary) {
          notes = parsed;
          usedAi = true;
        }
      } catch {
        // Fall back to the scored recap above.
      }
    }

    const recap: Recap = {
      session_id: id,
      session_title: fresh.title,
      starts_at: fresh.starts_at,
      ends_at: new Date(end).toISOString(),
      summary: notes.summary,
      decisions: notes.decisions,
      tasks: notes.tasks,
      blockers: notes.blockers,
      links,
      people,
      team_score: fresh.team_score,
      ai: usedAi,
    };

    const { error: recapErr } = await admin.from("session_recaps").upsert({
      session_id: id,
      room_id: session.room_id,
      summary: recap.summary,
      recap,
      team_score: recap.team_score,
      ai: usedAi,
    });
    if (recapErr) throw new Error(recapErr.message);

    await admin.from("messages").insert({
      room_id: session.room_id,
      user_id: null,
      type: "recap",
      body: recap.summary,
      session_id: id,
      meta: recap,
    });
    await admin.from("sessions").update({ recap_status: "done" }).eq("id", id);
    return json({ ok: true });
  } catch (e) {
    await admin.from("sessions").update({ recap_status: "failed" }).eq("id", id);
    return json({ error: (e as Error).message }, 500);
  }
}
