import "server-only";
import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export type LinkKind = "github" | "notion" | "gdoc" | "gsheet" | "gslides" | "gdrive" | "figma" | "web";

export type Unfurl = {
  url: string;
  kind: LinkKind;
  site: string;
  title: string | null;
  description: string | null;
  image: string | null;
  /** GitHub extras */
  github?: {
    type: "repo" | "pull" | "issue";
    repo: string;
    number?: number;
    state?: "open" | "closed" | "merged" | "draft";
    stars?: number;
    language?: string | null;
    author?: string;
  };
};

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 4000;

// ───────────────────────── SSRF guard ─────────────────────────
function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

export function isPrivateIp(ip: string) {
  const v = isIP(ip);
  if (v === 4) return privateV4(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateV4(mapped[1]);
    return /^(fc|fd|fe[89ab]|ff)/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8");
  }
  return true;
}

/** DNS lookup that refuses private addresses, used for every connection (so redirects and DNS rebinding are covered). */
const safeLookup: typeof lookup = ((hostname: string, options: unknown, cb: unknown) => {
  const callback = (typeof options === "function" ? options : cb) as (err: Error | null, address?: unknown, family?: number) => void;
  const opts = (typeof options === "object" && options ? options : {}) as { all?: boolean };
  lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as { address: string; family: number }[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) return callback(new Error("Blocked address"));
    if (opts.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}) as typeof lookup;

function allowedUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) return null;
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ""))) return null;
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(u.hostname)) return null;
  return u;
}

function getOnce(u: URL): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ByteBot/1.0; +link previews)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: "" });
        }
        if (!/text\/html|application\/xhtml/i.test(type)) {
          res.destroy();
          return resolve({ status, type, body: "" });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          // The <head> is all we need.
          if (size >= MAX_BYTES || /<\/head>/i.test(c.toString("latin1"))) res.destroy();
        });
        const done = () => resolve({ status, type, body: Buffer.concat(chunks).toString("utf8") });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function safeGet(raw: string) {
  let u = allowedUrl(raw);
  for (let hop = 0; u && hop < 4; hop++) {
    const res = await getOnce(u);
    if (res.location) {
      u = allowedUrl(new URL(res.location, u).toString());
      continue;
    }
    return { ...res, finalUrl: u.toString() };
  }
  return null;
}

// ───────────────────────── Parsing ─────────────────────────
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    );
    const m = html.match(re);
    const v = m?.[1] ?? m?.[2];
    if (v) return decode(v);
  }
  return null;
}

export function kindOf(u: URL): LinkKind {
  const h = u.hostname.replace(/^www\./, "");
  if (h === "github.com") return "github";
  if (h === "notion.so" || h.endsWith(".notion.so") || h.endsWith(".notion.site")) return "notion";
  if (h === "docs.google.com") {
    if (u.pathname.startsWith("/spreadsheets")) return "gsheet";
    if (u.pathname.startsWith("/presentation")) return "gslides";
    return "gdoc";
  }
  if (h === "drive.google.com") return "gdrive";
  if (h === "figma.com") return "figma";
  return "web";
}

const SITE: Record<LinkKind, string> = {
  github: "GitHub",
  notion: "Notion",
  gdoc: "Google Docs",
  gsheet: "Google Sheets",
  gslides: "Google Slides",
  gdrive: "Google Drive",
  figma: "Figma",
  web: "",
};

// Private Google and Notion pages answer with a sign-in screen; don't show that as the title.
const SIGN_IN = /sign[ -]?in|log ?in|google drive: |^notion$|accounts\.google/i;

async function github(u: URL): Promise<Unfurl | null> {
  const [owner, repo, section, num] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "Byte" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = (path: string) =>
    fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const full = `${owner}/${repo}`;
  const base = { url: u.toString(), kind: "github" as const, site: "GitHub", image: `https://opengraph.githubassets.com/1/${full}${section && num ? `/${section}/${num}` : ""}` };
  if ((section === "pull" || section === "issues") && /^\d+$/.test(num ?? "")) {
    const res = await api(`/${section === "pull" ? "pulls" : "issues"}/${num}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { title: string; body: string | null; state: "open" | "closed"; merged?: boolean; draft?: boolean; user?: { login: string } };
    return {
      ...base,
      title: j.title,
      description: j.body ? decode(j.body).slice(0, 200) : null,
      github: {
        type: section === "pull" ? "pull" : "issue",
        repo: full,
        number: Number(num),
        state: j.merged ? "merged" : j.draft ? "draft" : j.state,
        author: j.user?.login,
      },
    };
  }
  const res = await api("");
  if (!res.ok) return null;
  const j = (await res.json()) as { full_name: string; description: string | null; stargazers_count: number; language: string | null };
  return {
    ...base,
    title: j.full_name,
    description: j.description,
    github: { type: "repo", repo: j.full_name, stars: j.stargazers_count, language: j.language },
  };
}

const cache = new Map<string, { at: number; value: Unfurl | null }>();
const TTL = 60 * 60_000;

export async function unfurl(raw: string): Promise<Unfurl | null> {
  const u = allowedUrl(raw);
  if (!u) return null;
  const key = u.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  let value: Unfurl | null = null;
  const kind = kindOf(u);
  try {
    if (kind === "github") value = await github(u);
    if (!value) {
      const res = await safeGet(key);
      const html = res?.body ?? "";
      let title = meta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null);
      let description = meta(html, ["og:description", "twitter:description", "description"]);
      let image = meta(html, ["og:image", "og:image:url", "twitter:image"]);
      if (title && SIGN_IN.test(title)) {
        title = null;
        description = null;
        image = null;
      }
      if (image) {
        try {
          const iu = new URL(image, res?.finalUrl ?? key);
          image = iu.protocol === "https:" ? iu.toString() : null;
        } catch {
          image = null;
        }
      }
      const site = SITE[kind] || meta(html, ["og:site_name"]) || u.hostname.replace(/^www\./, "");
      if (title || kind !== "web") {
        value = {
          url: key,
          kind,
          site,
          title: title?.slice(0, 200) ?? null,
          description: description?.slice(0, 300) ?? null,
          image: image && image.length < 1000 ? image : null,
        };
      }
    }
  } catch {
    value = kind === "web" ? null : { url: key, kind, site: SITE[kind], title: null, description: null, image: null };
  }

  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}
