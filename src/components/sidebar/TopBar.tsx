"use client";

import { CommandPalette } from "@/components/CommandPalette";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/*
 * The bar across the top of every screen.
 *
 * It exists to give the search one fixed home. The palette was only
 * reachable by knowing ⌘K, which is fine for the person who built it
 * and invisible to everybody else — and this panel is run by somebody
 * who should not have to learn a shortcut to find a page.
 *
 * Sticky rather than fixed: the rails are pinned because they must never
 * move, but this sits inside the scrolling column and only needs to stay
 * above the content it scrolls over.
 *
 * Filled flat with the ground colour. It used to blur what passed
 * behind it, which painted a grey band across the top: a backdrop-filter
 * samples whatever sits behind it, and with the command palette open its
 * overlay — itself a backdrop-filter — got sampled twice, so the strip
 * darkened while the rest of the page did not. There is no blur left
 * anywhere in the panel now; an opaque fill in the page's own background
 * is invisible at rest and hides what scrolls under it just as well.
 */
export function TopBar() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;

      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single();

      if (alive) {
        setUser({
          name: profile?.display_name || "Admin",
          role: profile?.role || "admin",
        });
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 mb-4 bg-background px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <CommandPalette />

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-foreground">{user?.name ?? "Admin"}</p>
            <p className="text-[0.72rem] text-muted-foreground">{user?.role ?? "admin"}</p>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
