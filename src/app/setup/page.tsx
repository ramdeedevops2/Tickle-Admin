"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function SetupPage() {
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setChecking(false);
    };
    checkStatus();
  }, [router, supabase]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }

      // Update the admin_profiles table to promote to admin
      const { error: updateError } = await supabase
        .from('admin_profiles')
        .update({ 
          display_name: displayName,
          role: 'admin' 
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Force a session refresh to trigger middleware re-eval
      await supabase.auth.refreshSession();
      
      router.push("/");
      router.refresh();
      
    } catch (err: any) {
      setError(err.message || "Failed to setup admin account.");
      setLoading(false);
    }
  };

  if (checking) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Verifying access...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      
      <Card className="w-full max-w-md relative z-10 border-border/50 shadow-2xl shadow-primary/5">
        <CardHeader className="space-y-1 pb-8">
          <div className="flex mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <span className="text-primary font-bold tracking-tighter">NV</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Admin Bootstrap
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            You are setting up the first administrative account for NERVE.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSetup} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-foreground">Display Name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Chief Admin"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="bg-muted/50 border-border focus-visible:ring-primary"
              />
            </div>
            
            {error && <p className="text-sm text-destructive">{error}</p>}
            
            <div className="bg-muted/30 p-4 rounded-lg border border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                By completing this setup, your account will be granted <span className="text-primary font-medium">Full Access</span>. You will be responsible for inviting other team members and configuring platform settings.
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loading || !displayName.trim()}
            >
              {loading ? "Initializing..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
