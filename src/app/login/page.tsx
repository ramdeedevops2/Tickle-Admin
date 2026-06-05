"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      if (error.message.includes("Signups not allowed")) {
        const { error: signUpError } = await supabase.auth.signInWithOtp({
          email,
        });
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

  const handleResendOtp = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Code resent successfully.");
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

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
    <div className="min-h-screen grid lg:grid-cols-2 bg-background relative overflow-hidden text-foreground">
      {/* LEFT SIDE: Typography & Branding */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border relative overflow-hidden bg-black">
        <img
          src="https://images.pexels.com/photos/1024960/pexels-photo-1024960.jpeg?auto=compress&cs=tinysrgb&w=1400"
          alt="Couple"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/65"></div>
        <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/50 to-black/75"></div>
        {/* Architectural Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-size-[32px_32px]"></div>

        <div className="relative z-10"></div>

        {/* Huge background text drifting */}
        <motion.div
          initial={{ x: "0%" }}
          animate={{ x: "-50%" }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 opacity-[0.02] pointer-events-none select-none whitespace-nowrap"
        >
          <span className="text-[24rem] font-black tracking-tighter leading-none pr-40">
            TICKLE
          </span>
          <span className="text-[24rem] font-black tracking-tighter leading-none pr-40">
            TICKLE
          </span>
        </motion.div>
      </div>

      {/* RIGHT SIDE: Auth Form */}
      <div className="flex flex-col justify-center p-8 lg:p-24 relative z-10 bg-black">
        {/* Mobile Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:hidden flex items-center gap-6 mb-16"
        >
          <span className="text-3xl font-black tracking-tight uppercase">
            TICKLE
          </span>
        </motion.div>

        <div className="w-full max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-16"
          >
            <h2 className="text-4xl font-black tracking-tighter uppercase mb-3">
              {step === "email" ? "Access" : "Verify"}
            </h2>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 48 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="h-1 bg-foreground mb-4"
            ></motion.div>
          </motion.div>

          {step === "email" ? (
            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              onSubmit={handleSendOtp}
              className="space-y-8"
            >
              <div className="space-y-3 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
                  Email
                </label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-14 bg-transparent border-0 border-b-2 border-muted-foreground/30 focus-visible:ring-0 focus-visible:border-foreground rounded-none px-0 text-xl transition-all placeholder:text-transparent"
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-xs uppercase tracking-widest text-background bg-foreground p-4 border-l-4 border-muted-foreground font-bold"
                >
                  Error: {error}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-16 bg-foreground text-background hover:bg-muted-foreground transition-colors rounded-none text-sm font-bold uppercase tracking-[0.2em] group mt-8"
                disabled={loading || !email}
              >
                {loading ? "Authenticating..." : "Continue"}
                {!loading && (
                  <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                )}
              </Button>
            </motion.form>
          ) : (
            <motion.form
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              onSubmit={handleVerifyOtp}
              className="space-y-8"
            >
              <div className="space-y-3 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
                  Security Code
                </label>
                <Input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={8}
                  className="h-20 bg-transparent border-0 border-b-2 border-muted-foreground/30 focus-visible:ring-0 focus-visible:border-foreground rounded-none text-center text-4xl tracking-[0.5em] font-mono transition-all"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-xs uppercase tracking-widest text-background bg-foreground p-4 border-l-4 border-muted-foreground font-bold"
                >
                  Error: {error}
                </motion.div>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-xs uppercase tracking-widest text-foreground bg-foreground/10 p-4 border-l-4 border-foreground font-bold"
                >
                  {success}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-16 bg-foreground text-background hover:bg-muted-foreground transition-colors rounded-none text-sm font-bold uppercase tracking-[0.2em] group mt-8"
                disabled={loading || otp.length < 6}
              >
                {loading ? "Decrypting..." : "Enter"}
                {!loading && (
                  <Lock className="ml-3 h-5 w-5 group-hover:scale-110 transition-transform" />
                )}
              </Button>

              <div className="flex gap-4 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-none text-[10px] uppercase tracking-[0.2em] text-foreground border-foreground/20 hover:bg-foreground hover:text-background transition-colors"
                  onClick={handleResendOtp}
                  disabled={loading}
                >
                  Resend Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-none text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </motion.form>
          )}
        </div>

        {/* Decorative corner brackets */}
        <div className="absolute top-8 right-8 w-8 h-8 border-t-2 border-r-2 border-muted-foreground/30"></div>
        <div className="absolute bottom-8 right-8 w-8 h-8 border-b-2 border-r-2 border-muted-foreground/30"></div>
      </div>
    </div>
  );
}
