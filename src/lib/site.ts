const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

/**
 * The public address for links people share (invites, webhooks). Uses
 * NEXT_PUBLIC_SITE_URL when set, but never a localhost value on a live site,
 * so a copied-over .env.local can't put localhost into invite links.
 */
export function publicOrigin() {
  const here = window.location.origin;
  const env = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (!env || !/^https?:\/\//.test(env)) return here;
  if (LOCAL.test(env) && !LOCAL.test(here)) return here;
  return env;
}
