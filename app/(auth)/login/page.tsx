"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "password" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMagicSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Cinematic Creator</h1>
          <p className="text-sm text-[var(--muted)]">
            {mode === "password" ? "Sign in to your account." : "We'll email you a one-time link."}
          </p>
        </div>

        {mode === "magic" && magicSent ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Check your email — magic link sent to <span className="font-medium">{email}</span>.
            </p>
            <button
              type="button"
              onClick={() => {
                setMagicSent(false);
                setMode("password");
              }}
              className="text-xs text-[var(--muted)] hover:text-foreground"
            >
              ← Back to password sign-in
            </button>
          </div>
        ) : mode === "password" ? (
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("magic")}
              className="block w-full text-center text-xs text-[var(--muted)] hover:text-foreground"
            >
              Forgot password? Send a magic link instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Sending…" : "Send magic link"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("password")}
              className="block w-full text-center text-xs text-[var(--muted)] hover:text-foreground"
            >
              ← Back to password sign-in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
