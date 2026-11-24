import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";

export function notionConfig() {
  const clientId = process.env.NOTION_CLIENT_ID ?? "";
  const clientSecret = process.env.NOTION_CLIENT_SECRET ?? "";
  return { clientId, clientSecret, ready: Boolean(clientId && clientSecret) };
}

export const notionRedirect = (origin: string) => `${origin}/api/integrations/notion/callback`;

type TokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  workspace_id?: string;
  workspace_name?: string | null;
  workspace_icon?: string | null;
};

async function tokenRequest(body: Record<string, string>) {
  const { clientId, clientSecret } = notionConfig();
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      "Notion-Version": VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Notion said ${res.status}`);
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export type NotionItem = { id: string; title: string; url: string; icon: string | null; kind: "page" | "database"; edited: string | null };

function plain(rich: unknown): string {
  return Array.isArray(rich) ? rich.map((r) => (r as { plain_text?: string }).plain_text ?? "").join("") : "";
}

function toItem(r: Record<string, unknown>): NotionItem | null {
  const object = r.object as string;
  if (!["page", "database", "data_source"].includes(object) || !r.url) return null;
  let title = plain(r.title);
  if (!title && r.properties && typeof r.properties === "object") {
    for (const p of Object.values(r.properties as Record<string, { type?: string; title?: unknown }>)) {
      if (p?.type === "title") {
        title = plain(p.title);
        break;
      }
    }
  }
  const icon = r.icon as { type?: string; emoji?: string; external?: { url: string }; file?: { url: string } } | null;
  return {
    id: r.id as string,
    title: title.trim() || "Untitled",
    url: r.url as string,
    icon: icon?.type === "emoji" ? (icon.emoji ?? null) : (icon?.external?.url ?? icon?.file?.url ?? null),
    kind: object === "page" ? "page" : "database",
    edited: (r.last_edited_time as string) ?? null,
  };
}

/** Searches the pages the person shared with Byte. Refreshes the token once if it expired. */
export async function searchNotion(admin: SupabaseClient, userId: string, query: string): Promise<NotionItem[] | "not-connected"> {
  const { data: conn } = await admin
    .from("user_connections")
    .select("access_token, refresh_token")
    .eq("user_id", userId)
    .eq("provider", "notion")
    .maybeSingle();
  if (!conn) return "not-connected";

  const run = (token: string) =>
    fetch(`${API}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": VERSION },
      body: JSON.stringify({
        query: query.slice(0, 100),
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 15,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

  let res = await run(conn.access_token as string);
  if (res.status === 401 && conn.refresh_token) {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refresh_token as string });
      await admin
        .from("user_connections")
        .update({ access_token: t.access_token, refresh_token: t.refresh_token ?? conn.refresh_token })
        .eq("user_id", userId)
        .eq("provider", "notion");
      res = await run(t.access_token);
    } catch {
      return "not-connected";
    }
  }
  if (res.status === 401) return "not-connected";
  if (!res.ok) throw new Error(`Notion said ${res.status}`);
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  return (json.results ?? []).map(toItem).filter((x): x is NotionItem => Boolean(x));
}
