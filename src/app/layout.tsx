import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

/*
 * Poppins, the geometric sans the reference is built on.
 *
 * Self-hosted through next/font rather than linked: it removes the
 * render-blocking request to Google and, more importantly, the layout
 * shift when the fallback swaps out — at 13px base, a reflow of every
 * label on the page is very visible.
 *
 * Only the four weights actually used. Shipping nine would be most of a
 * megabyte for faces nothing references.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TICKLE",
  description: "Central command center for the Tickle platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Light, where this was hard-coded dark. The palette in globals.css
    // is a light system now, and leaving the dark class on would have
    // every component picking dark: variants against light tokens.
    <html lang="en" className={poppins.variable} style={{ colorScheme: "light" }}>
      <body className="antialiased font-sans bg-background text-foreground">
        <TooltipProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
