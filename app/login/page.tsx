"use client";

import Lights from "@/components/Lights";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NAVY } from "@/components/ui";

type Person = { id: string; name: string; hasPin: boolean; owner: boolean };
type Health = { env: string; setupCode: boolean; authSecret: boolean; database: boolean; photos: boolean };

export default function Login() {
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/auth/users").then((r) => r.json()).then(setPeople).catch(() => setErr("Couldn't load the team list."));
    fetch("/api/auth/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);
  const who = people.find((p) => p.id === userId);
  const firstOwner = who && !who.hasPin && who.owner;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, pin, setupCode: setupCode || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error || `Sign-in failed (error ${res.status}). This deployment may be an older version; open the newest preview.`);
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden" style={{ background: "radial-gradient(120% 80% at 50% 0%, #1D4380 0%, #112E5B 45%, #0B1F3D 100%)" }}>
      <Lights className="absolute top-0 left-0 w-full h-10 md:h-14" count={24} />
      <form onSubmit={submit} className="relative bg-white rounded-3xl p-6 sm:p-7 w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl grid place-items-center font-extrabold text-lg text-white shrink-0" style={{ background: "linear-gradient(135deg, #1D4380, #0B1F3D)" }}>
            <span>L<span style={{ color: "#F5A524" }}>D</span></span>
          </span>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight" style={{ color: NAVY }}>Light DMV</h1>
            <p className="text-slate-500 text-sm">Sign in with your name and PIN.</p>
          </div>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Who are you?</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required
            className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-3 bg-white">
            <option value="">Pick your name</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {who && !who.hasPin && !who.owner && (
          <p className="text-sm bg-amber-50 text-amber-800 rounded-lg p-3">You don't have a PIN yet. Ask Chris or Liam to set one for you on the People page.</p>
        )}
        <label className="block">
          <span className="text-sm font-semibold">{firstOwner ? "Choose a PIN (4 to 8 digits)" : "PIN"}</span>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required
            inputMode="numeric" autoComplete="current-password" type="password" maxLength={8}
            className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-3 tracking-widest text-lg" />
        </label>
        {firstOwner && (
          <label className="block">
            <span className="text-sm font-semibold">Owner setup code</span>
            <input value={setupCode} onChange={(e) => setSetupCode(e.target.value)} required type="password"
              className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-3" />
            <span className="text-xs text-slate-500">The OWNER_SETUP_CODE value set in Vercel. Only needed once.</span>
          </label>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {health && (firstOwner || !health.database) && (
          <div className="text-xs text-slate-500 border-t pt-2 space-y-0.5">
            <div className="font-semibold">This {health.env} deployment can see:</div>
            {([["setupCode", "OWNER_SETUP_CODE"], ["database", "Database (Supabase)"], ["photos", "Photo storage"]] as const).map(([k, label]) => (
              <div key={k} className={health[k] ? "text-green-700" : "text-red-600"}>{health[k] ? "✓" : "✗"} {label}</div>
            ))}
          </div>
        )}
        <button disabled={busy} className="w-full rounded-xl py-3.5 font-bold shadow-lift text-white flex justify-center gap-2" style={{ background: NAVY }}>
          {busy && <Loader2 className="animate-spin" size={20} />} Sign in
        </button>
      </form>
    </div>
  );
}
