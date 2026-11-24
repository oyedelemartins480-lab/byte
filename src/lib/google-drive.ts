"use client";

/**
 * Google Drive file picker. Uses Google's own Picker, with the narrow
 * "drive.file" permission: Byte only learns about the files you pick.
 */
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

export const driveReady = Boolean(API_KEY && CLIENT_ID);

export type DriveFile = { id: string; name: string; url: string; mimeType: string; iconUrl: string | null };

/* Minimal typings for the bits of Google's scripts we use. */
type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void };
type PickerDoc = Record<string, string>;
type PickerData = Record<string, unknown>;
type GoogleNS = {
  accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: unknown) => void }) => TokenClient } };
  picker: Record<string, unknown> & {
    PickerBuilder: new () => Record<string, (...a: unknown[]) => unknown>;
    DocsView: new (viewId?: unknown) => Record<string, (...a: unknown[]) => unknown>;
    ViewId: Record<string, unknown>;
    Feature: Record<string, unknown>;
    Action: Record<string, string>;
    Response: Record<string, string>;
    Document: Record<string, string>;
  };
};
declare global {
  interface Window {
    google?: GoogleNS;
    gapi?: { load: (lib: string, cb: () => void) => void };
  }
}

const scripts = new Map<string, Promise<void>>();
function load(src: string) {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Couldn't reach Google. Check your connection."));
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

let token: { value: string; until: number } | null = null;
let client: TokenClient | null = null;

async function accessToken(): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  await load("https://accounts.google.com/gsi/client");
  const g = window.google!;
  return new Promise<string>((resolve, reject) => {
    const cb = (r: TokenResponse) => {
      if (r.error || !r.access_token) return reject(new Error("Google sign-in was cancelled."));
      token = { value: r.access_token, until: Date.now() + 55 * 60_000 };
      resolve(r.access_token);
    };
    if (!client) client = g.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: cb, error_callback: () => reject(new Error("Google sign-in was cancelled.")) });
    else client.callback = cb;
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

/** Opens Google's file picker. Resolves with the files picked (empty if cancelled). */
export async function pickDriveFiles(): Promise<DriveFile[]> {
  if (!driveReady) throw new Error("Google Drive isn't set up on this server.");
  const [oauth] = await Promise.all([accessToken(), load("https://apis.google.com/js/api.js")]);
  await new Promise<void>((r) => window.gapi!.load("picker", () => r()));
  const p = window.google!.picker;

  return new Promise<DriveFile[]>((resolve) => {
    const view = new p.DocsView(p.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    const builder = new p.PickerBuilder();
    builder.addView(view);
    builder.addView(new p.DocsView(p.ViewId.RECENTLY_PICKED));
    builder.enableFeature(p.Feature.MULTISELECT_ENABLED);
    builder.enableFeature(p.Feature.SUPPORT_DRIVES);
    builder.setOAuthToken(oauth);
    builder.setDeveloperKey(API_KEY);
    if (APP_ID) builder.setAppId(APP_ID);
    builder.setTitle("Share from Google Drive");
    builder.setCallback((data: PickerData) => {
      const action = data[p.Response.ACTION];
      if (action === p.Action.CANCEL) return resolve([]);
      if (action !== p.Action.PICKED) return;
      const docs = (data[p.Response.DOCUMENTS] as PickerDoc[] | undefined) ?? [];
      resolve(
        docs
          .map((d) => ({
            id: d[p.Document.ID],
            name: d[p.Document.NAME] || "Untitled",
            url: d[p.Document.URL],
            mimeType: d[p.Document.MIME_TYPE] || "",
            iconUrl: d[p.Document.ICON_URL] || null,
          }))
          .filter((d) => /^https:\/\/(docs|drive)\.google\.com\//.test(d.url)),
      );
    });
    (builder.build() as { setVisible: (v: boolean) => void }).setVisible(true);
  });
}
