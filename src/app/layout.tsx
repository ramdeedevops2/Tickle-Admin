import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "NERVE | Tickle Admin",
  description: "Central command center for the Tickle platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body className="antialiased font-sans bg-background text-foreground">
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
