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
        {/* Plain <img>: this is a decorative full-bleed backdrop with
            no intrinsic size to reserve, so next/image's layout work
            buys nothing and its loader would only add a hop. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
      <div className="relative z-10 flex flex-col justify-center bg-background p-8 lg:p-24">
        {/* Mobile Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:hidden flex items-center gap-6 mb-16"
        >
          <span className="text-[1.5rem] font-semibold tracking-tight">
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
            <h2 className="mb-3 text-[2rem] font-medium tracking-tight">
              {step === "email" ? "Access" : "Verify"}
            </h2>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 48 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="mb-4 h-0.5 rounded-full bg-foreground/80"
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
                <label className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors group-focus-within:text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl px-4 text-base"
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive"
                >{error}
                </motion.div>
              )}

              <Button
                type="submit"
                className="group mt-8 h-12 w-full text-[0.8rem]"
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
                <label className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors group-focus-within:text-foreground">
                  Security Code
                </label>
                <Input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={8}
                  className="h-16 rounded-xl text-center font-mono text-[1.75rem] tracking-[0.4em]"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive"
                >{error}
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
                className="group mt-8 h-12 w-full text-[0.8rem]"
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
                  className="h-10 w-full text-[0.92rem]"
                  onClick={handleResendOtp}
                  disabled={loading}
                >
                  Resend Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-full text-[0.92rem]"
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
