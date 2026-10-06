"use client";

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: NAVY }}>
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>Light DMV</h1>
          <p className="text-slate-500 text-sm">Sign in with your name and PIN.</p>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Who are you?</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white">
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
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 tracking-widest text-lg" />
        </label>
        {firstOwner && (
          <label className="block">
            <span className="text-sm font-semibold">Owner setup code</span>
            <input value={setupCode} onChange={(e) => setSetupCode(e.target.value)} required type="password"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5" />
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
        <button disabled={busy} className="w-full rounded-lg py-3 font-bold text-white flex justify-center gap-2" style={{ background: NAVY }}>
          {busy && <Loader2 className="animate-spin" size={20} />} Sign in
        </button>
      </form>
    </div>
  );
}
