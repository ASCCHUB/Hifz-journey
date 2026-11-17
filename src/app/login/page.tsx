"use client";
// Sign in with email and password, or with Google. Uses Supabase Auth.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@/components/Shell";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter(); const user = useUser();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) router.replace("/profile"); }, [user, router]);

  if (!supabaseConfigured) return (
    <div className="card flex flex-col gap-2">
      <h1 className="text-xl font-bold">Accounts are not set up yet</h1>
      <p className="text-muted">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, run supabase/schema.sql in your Supabase project, and restart. The README has the steps. The app works without an account and keeps progress on this device.</p>
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const sb = supabase(); if (!sb) return;
    setBusy(true); setErr(""); setMsg("");
    const { data, error } = mode === "in"
      ? await sb.auth.signInWithPassword({ email, password: pw })
      : await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: `${window.location.origin}/profile` } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (mode === "up" && !data.session) setMsg("Check your email for a confirmation link, then sign in.");
  };
  const google = async () => {
    const sb = supabase(); if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/profile` } });
    if (error) setErr(error.message);
  };

  return (
    <div className="max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{mode === "in" ? "Sign in" : "Create an account"}</h1>
      <button className="btn" onClick={google}>Continue with Google</button>
      <div className="text-center text-sm text-muted">or use your email</div>
      <form className="card flex flex-col gap-3" onSubmit={submit}>
        <label className="text-sm text-muted">Email<input type="email" required autoComplete="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="text-sm text-muted">Password<input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} className="field mt-1" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <p className="text-sm text-weak">{err}</p>}
        {msg && <p className="text-sm text-accent">{msg}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="text-sm underline text-muted" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); setMsg(""); }}>{mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    </div>
  );
}
