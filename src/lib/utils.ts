/** Only allow same-site relative paths as redirect targets. */
export function safeNextServer(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Pulls the invite code out of a pasted link like https://byte.chat/join/7Kq2mXa9Lb or a bare code. */
export function parseInviteCode(input: string) {
  const v = input.trim();
  const m = v.match(/\/join\/([A-Za-z0-9]{6,16})/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{6,16}$/.test(v) ? v : null;
}

export function suggestUsername(name: string, email = "") {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)[0] || email.split("@")[0] || "";
  const clean = base.replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return clean.length >= 3 ? clean : `${clean}${"byte".slice(0, 3 - clean.length + 1)}`.slice(0, 20);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
export function extractLinks(text: string) {
  return Array.from(new Set(text.match(URL_RE) ?? []));
}
