"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { api, Me, NAVY } from "@/components/ui";
import { CREW_LABEL } from "../signs/types";

type Person = { id: string; name: string; role: string; crew?: string; phone?: string; jobberName?: string; active: boolean; hasPin: boolean };
const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", lead: "Crew lead", crew: "Crew" };
const blank: Person = { id: "", name: "", role: "crew", active: true, hasPin: false };

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [edit, setEdit] = useState<(Person & { pin?: string }) | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Person[]>("/api/people").then(setPeople).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); api<Me>("/api/me").then(setMe).catch(() => {}); }, [load]);

  async function save() {
    if (!edit) return;
    setBusy(true); setErr("");
    try {
      await api("/api/people", { method: "POST", json: { ...edit, id: edit.id || undefined, pin: edit.pin || undefined } });
      setEdit(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!people) return <div className="p-6 text-slate-500 flex gap-2">{err || <><Loader2 className="animate-spin" /> Loading...</>}</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: NAVY }}>People</h1>
          <p className="text-sm text-slate-500">Everyone signs in with their name and a PIN you set here.</p>
        </div>
        <button onClick={() => setEdit({ ...blank })} className="rounded-lg px-3 py-2 text-white font-semibold flex items-center gap-1" style={{ background: NAVY }}>
          <Plus size={16} /> Add person
        </button>
      </div>
      <ul className="bg-white rounded-xl border border-slate-200 divide-y">
        {people.map((p) => (
          <li key={p.id}>
            <button onClick={() => setEdit({ ...p })} className="w-full text-left p-3 flex justify-between gap-2 items-center">
              <span>
                <span className={`font-semibold ${p.active ? "" : "line-through text-slate-400"}`}>{p.name}</span>
                <span className="block text-xs text-slate-500">
                  {ROLE_LABEL[p.role]}{p.crew ? ` · ${CREW_LABEL[p.crew] || p.crew}` : ""}{p.jobberName ? ` · Jobber: ${p.jobberName}` : ""}
                </span>
              </span>
              <span className={`text-xs font-semibold ${p.hasPin ? "text-green-700" : "text-amber-700"}`}>{p.hasPin ? "PIN set" : "No PIN yet"}</span>
            </button>
          </li>
        ))}
      </ul>

      {edit && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setEdit(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">{edit.id ? `Edit ${edit.name}` : "Add a person"}</h2>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="inp" /></Field>
            <Field label="Role">
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className="inp">
                {Object.entries(ROLE_LABEL).filter(([k]) => k !== "owner" || me?.role === "owner").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Crew">
              <select value={edit.crew || ""} onChange={(e) => setEdit({ ...edit, crew: e.target.value || undefined })} className="inp">
                <option value="">None (office)</option>
                {Object.entries(CREW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Name in Jobber (so their visits land on the right crew)">
              <input value={edit.jobberName || ""} onChange={(e) => setEdit({ ...edit, jobberName: e.target.value })} className="inp" />
            </Field>
            <Field label="Phone"><input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="inp" inputMode="tel" /></Field>
            <Field label={edit.hasPin ? "New PIN (leave blank to keep)" : "PIN (4 to 8 digits)"}>
              <input value={edit.pin || ""} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, "") })} className="inp tracking-widest" inputMode="numeric" maxLength={8} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Can sign in
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEdit(null)} className="flex-1 rounded-lg py-2.5 border border-slate-300 font-semibold">Cancel</button>
              <button onClick={save} disabled={busy || !edit.name} className="flex-1 rounded-lg py-2.5 text-white font-semibold disabled:opacity-50" style={{ background: NAVY }}>Save</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;border:1px solid #CBD5E1;border-radius:.5rem;padding:.55rem .75rem;background:#fff}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-semibold">{label}</span><div className="mt-1">{children}</div></label>;
}
