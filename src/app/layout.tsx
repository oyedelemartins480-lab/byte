import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Self-hosted (SIL Open Font License) so builds never depend on reaching Google Fonts.
const nunito = localFont({
  src: "../fonts/nunito.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
});

const onest = localFont({
  src: "../fonts/onest.woff2",
  variable: "--font-onest",
  weight: "100 900",
  display: "swap",
});

const jetbrains = localFont({
  src: "../fonts/jetbrains-mono-500.woff2",
  variable: "--font-jetbrains",
  weight: "500",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Byte · Lock in together",
  description:
    "WhatsApp is where you talk. Byte is where you lock in. Team chat, timed lock-in sessions and AI recaps, all on your laptop.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${nunito.variable} ${onest.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
