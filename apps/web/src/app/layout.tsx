import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";
import { env } from "@/env";
import { Background } from "@/components/background";
import { Divider } from "@/components/dithercn/divider";
import { SiteHeader } from "@/components/site-header";
import { SITE_METADATA } from "@/lib/site";
import "./globals.css";

const GEIST = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const GEIST_MONO = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata = SITE_METADATA;
const UMAMI_WEBSITE_ID = "3c2a7bc4-9454-4842-a674-dcecd71ea576";
export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GEIST.variable} ${GEIST_MONO.variable} dark antialiased`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Background />
        <a
          href="#main"
          className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 pt-10 pb-20 sm:px-8">
          <NuqsAdapter>{children}</NuqsAdapter>
        </main>
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
          <Divider fade={0.4} strength={0.35} />
        </div>
        <footer className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8">
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="font-mono">schedules.sh</span> - inspired by
            <a href="https://skills.sh" className="text-foreground underline">
              skills.sh
            </a>
            from
            <a href="https://vercel.com" className="text-foreground flex items-center gap-1">
              <svg aria-hidden="true" viewBox="0 0 76 65" className="size-3 fill-current">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              Vercel
            </a>
          </span>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </footer>
        <Toaster theme="dark" position="bottom-right" />
        {env.VERCEL_ENV === "production" && (
          <Script
            src="/u/script.js"
            data-website-id={UMAMI_WEBSITE_ID}
            data-domains="schedules.sh"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
