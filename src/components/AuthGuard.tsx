"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/login");
        return;
      }

      /*
       * The error is captured, not discarded.
       *
       * admin_profiles is behind RLS, so a policy that does not match and
       * a row that does not exist produce the same null — and the old code
       * treated both as"not an admin" and signed the person out. When the
       * cause is actually a policy problem that is a locked door with no
       * sign on it.
       *
       * maybeSingle rather than single: single() treats zero rows as an
       * error, which is exactly the case that needs telling apart.
       */
      const { data: profile, error: profileError } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[AuthGuard] could not read admin_profiles:', profileError.message);
        router.push(`/login?error=${encodeURIComponent(profileError.message)}`);
        return;
      }

      if (!profile) {
        console.warn('[AuthGuard] no admin row for', session.user.id);
        await supabase.auth.signOut();
        router.push("/login?error=no-admin-row");
        return;
      }

      if (profile.role !== 'admin' && profile.role !== 'moderator') {
        /*
         * There is no 'pending' path any more.
         *
         * 048 removed the signup trigger that gave every app user an
         * admin_profiles row, and with it the /setup page those rows
         * were sent to — that page promoted whoever opened it to admin,
         * and only failed because RLS has no UPDATE policy on the table.
         */
        await supabase.auth.signOut();
        router.push("/login?error=unauthorized");
        return;
      }

      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
