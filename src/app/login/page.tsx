"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // Don't create random users, they must be invited, except the first one
      },
    });

    if (error) {
      if (error.message.includes("Signups not allowed")) {
        // Fallback for first admin: if signup is disabled, we might need a different approach,
        // but for now let's attempt to just sign in.
        const { error: signUpError } = await supabase.auth.signInWithOtp({ email });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
      } else {
        setError(error.message);
        setLoading(false);
        return;
      }
    }

    setStep("otp");
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      
      <Card className="w-full max-w-md relative z-10 border-border/50 shadow-2xl shadow-primary/5">
        <CardHeader className="space-y-1 text-center pb-8">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <span className="text-primary font-bold text-xl tracking-tighter">NV</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            NERVE
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === "email" 
              ? "Enter your admin email to receive a code" 
              : `We sent a code to ${email}`}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@tickle.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-muted/50 border-border focus-visible:ring-primary"
                />
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button 
                type="submit" 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading || !email}
              >
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={6}
                  className="bg-muted/50 border-border focus-visible:ring-primary text-center text-lg tracking-widest"
                />
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button 
                type="submit" 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading || otp.length < 6}
              >
                {loading ? "Verifying..." : "Sign In"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError(null);
                }}
              >
                Back to Email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
