import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Byte",
    short_name: "Byte",
    description: "Team chat for locking in. WhatsApp is where you talk; Byte is where you lock in.",
    start_url: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#141413",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
