import "server-only";
import { adminKey } from "./supabase/admin";
import type { Message, Task } from "./types";

/**
 * Byte talks to any OpenAI-compatible endpoint, so the provider is just config:
 *   NVIDIA:      AI_BASE_URL=https://integrate.api.nvidia.com/v1
 *   FreeLLMAPI:  AI_BASE_URL=http://localhost:3001/v1   (your self-hosted router)
 *   OpenRouter:  AI_BASE_URL=https://openrouter.ai/api/v1
 *   Groq:        AI_BASE_URL=https://api.groq.com/openai/v1
 */
export function aiConfig() {
  const base = (process.env.AI_BASE_URL ?? "").replace(/\/+$/, "");
  const model = process.env.AI_MODEL ?? "";
  return {
    base,
    key: process.env.AI_API_KEY ?? "",
    model,
    recapModel: process.env.AI_RECAP_MODEL || model,
    transcribeBase: (process.env.AI_TRANSCRIBE_BASE_URL || base).replace(/\/+$/, ""),
    transcribeKey: process.env.AI_TRANSCRIBE_API_KEY || process.env.AI_API_KEY || "",
    transcribeModel: process.env.AI_TRANSCRIBE_MODEL ?? "",
  };
}

/** Chat AI needs an endpoint, a model and the server key (to write notes back). */
export function aiReady() {
  const c = aiConfig();
  return Boolean(c.base && c.model && adminKey());
}

export function transcribeReady() {
  const c = aiConfig();
  return Boolean(c.transcribeBase && c.transcribeModel && adminKey());
}

export async function chat({
  system,
  user,
  model,
  maxTokens = 700,
  timeoutMs = 45_000,
}: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}) {
  const c = aiConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${c.base}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}),
      },
      body: JSON.stringify({
        model: model || c.model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`AI provider returned ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    // Some reasoning models wrap their thinking in <think> tags; drop it.
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  } finally {
    clearTimeout(timer);
  }
}

/** Models don't always return clean JSON; pull out the first object and coerce the fields we need. */
export function parseNotes(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: Record<string, unknown> = {};
  if (start >= 0 && end > start) {
    try {
      raw = JSON.parse(text.slice(start, end + 1));
    } catch {
      raw = {};
    }
  }
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 12) : [];
  const tasks: Task[] = Array.isArray(raw.tasks)
    ? raw.tasks
        .map((t) =>
          typeof t === "object" && t
            ? { who: String((t as Task).who ?? "").trim(), what: String((t as Task).what ?? "").trim() }
            : null,
        )
        .filter((t): t is Task => Boolean(t && t.what))
        .slice(0, 12)
    : [];
  const summary =
    typeof raw.summary === "string" ? raw.summary.trim() : start < 0 ? text.trim().slice(0, 1200) : "";
  return { summary: summary.slice(0, 1500), decisions: strings(raw.decisions), tasks, blockers: strings(raw.blockers) };
}

/** Turns messages into compact lines for the model. GIFs, stickers and system lines never reach it. */
export function transcript(messages: Message[], names: Map<string, string>) {
  const t = (iso: string) => new Date(iso).toISOString().slice(11, 16);
  return messages
    .filter((m) => !m.deleted_at)
    .map((m) => {
      const who = m.user_id ? names.get(m.user_id) ?? "Someone" : "Byte AI";
      const meta = m.meta as Record<string, unknown>;
      switch (m.type) {
        case "text":
          return `[${t(m.created_at)}] ${who}: ${m.body.slice(0, 800)}`;
        case "checkin":
          return `[${t(m.created_at)}] ${who} set their goal: ${m.body}`;
        case "progress":
          return `[${t(m.created_at)}] ${who} progress update: ${m.body}`;
        case "done":
          return `[${t(m.created_at)}] ${who} finished (hit goal: ${meta.goal_met}): ${m.body}`;
        case "file":
          return `[${t(m.created_at)}] ${who} shared a file: ${meta.name}`;
        case "voice":
          return meta.transcript ? `[${t(m.created_at)}] ${who} (voice note): ${String(meta.transcript).slice(0, 800)}` : null;
        default:
          return null;
      }
    })
    .filter(Boolean)
    .join("\n");
}

export const NOTES_SYSTEM = `You keep running notes for a team work session in Byte, a focused team chat app.
You get the previous notes (may be empty) and the newest messages.
Return ONLY a JSON object, no prose, in this shape:
{"summary": "...", "decisions": ["..."], "tasks": [{"who": "...", "what": "..."}], "blockers": ["..."]}
Rules:
- summary: at most 120 words, plain sentences, what the team is working on and where things stand.
- decisions: things the team agreed on. tasks: who is doing what next. blockers: what is stuck.
- Each item under 15 words. Use people's names as written.
- Only use what the messages say. Carry forward items from the previous notes that still apply; drop resolved blockers.`;

export const RECAP_SYSTEM = `You write the end-of-session recap for a team that just finished a timed work session in Byte.
You get each person's goal and what they finished, the running notes, and the last messages.
Return ONLY a JSON object, no prose:
{"summary": "...", "decisions": ["..."], "tasks": [{"who": "...", "what": "..."}], "blockers": ["..."]}
Rules:
- summary: 2 to 4 sentences, at most 80 words, written to the team ("You..."), saying what got done and what's next. Warm but not cheesy, no emoji.
- tasks: open follow-ups for next time. blockers: anything still stuck.
- Each item under 15 words. Only use what the input says.`;

export const ASK_SYSTEM = `You are Byte AI, the assistant inside one team's chat room.
Answer the question using ONLY the room history provided (messages and past session recaps).
If the answer is not in the history, say you couldn't find it in this room's history.
Be brief: at most 100 words. Say who said what and roughly when when it helps. No emoji. Plain text, no markdown headings.`;
