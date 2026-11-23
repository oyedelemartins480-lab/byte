import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GiphyImage = { url: string; width: string; height: string; webp?: string };
type GiphyGif = { id: string; title: string; images: { fixed_height: GiphyImage; fixed_width_small: GiphyImage } };

/**
 * GIF search, proxied so the GIPHY key never reaches the browser.
 * Only signed-in users can call it.
 */
export async function GET(request: NextRequest) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GIFs are off. Add GIPHY_API_KEY to .env.local to turn them on." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to search GIFs." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  const endpoint = q ? "search" : "trending";
  const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg-13");
  if (q) url.searchParams.set("q", q);

  const res = await fetch(url, { next: { revalidate: q ? 300 : 900 } });
  if (!res.ok) return NextResponse.json({ error: "GIF search is having a moment. Try again." }, { status: 502 });
  const json = (await res.json()) as { data: GiphyGif[] };

  return NextResponse.json({
    results: json.data.map((g) => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.webp ?? g.images.fixed_height.url,
      preview: g.images.fixed_width_small.webp ?? g.images.fixed_width_small.url,
      width: Number(g.images.fixed_height.width),
      height: Number(g.images.fixed_height.height),
    })),
  });
}
