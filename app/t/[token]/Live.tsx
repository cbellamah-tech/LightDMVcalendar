"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Truck } from "lucide-react";
import Lights from "@/components/Lights";
import type { PublicView } from "@/lib/tracker";

const SignMap = dynamic(() => import("@/components/SignMap"), { ssr: false });

const TZ = "America/New_York";
const clock = (t: number | string) => new Date(t).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayName = (t: string) => new Date(t).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
const window_ = (a?: number, b?: number) => (a && b ? `${clock(a)} to ${clock(b)}` : "");
const homes = (n: number) => `${n} home${n === 1 ? "" : "s"}`;

export default function Live({ token }: { token: string }) {
  const [v, setV] = useState<PublicView | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const load = () => fetch(`/api/t/${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json()).then(setV).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    const u = setInterval(() => tick((x) => x + 1), 15_000);
    return () => { clearInterval(t); clearInterval(u); };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0B1F3D] text-white">
      <header className="relative pt-12 pb-6 px-5 text-center" style={{ background: "linear-gradient(180deg, #0B1F3D 0%, #112E5B 100%)" }}>
        <Lights className="absolute top-0 left-0 w-full h-10" count={16} />
        <div className="text-[11px] font-bold uppercase tracking-[.2em] text-[#F5A524]">Light DMV</div>
        <h1 className="text-2xl font-extrabold mt-1">Your crew, live</h1>
      </header>
      <main className="max-w-md mx-auto px-4 pb-10 space-y-4">
        {!v ? <div className="flex justify-center py-10 text-white/60"><Loader2 className="animate-spin" /></div> : <Body v={v} />}
      </main>
    </div>
  );
}

function Body({ v }: { v: PublicView }) {
  if (v.state === "gone") return <Card><p className="text-lg font-bold">This link has expired.</p><p className="text-slate-600 text-sm mt-1">If you have a question about your lights, just reply to our text.</p></Card>;
  if (v.state === "future") {
    return (
      <Card>
        <p className="text-sm font-semibold text-slate-500">Your visit</p>
        <p className="text-2xl font-extrabold text-[#112E5B]">{dayName(v.start)}</p>
        {!v.allDay && <p className="text-slate-600">Booked for {clock(v.start)}</p>}
        <p className="text-sm text-slate-600 mt-2">This page goes live that morning: you'll see {v.lead}'s crew work through the day and when they'll reach you.</p>
      </Card>
    );
  }
  const what = v.kind === "takedown" ? "taking down your lights" : v.kind === "fix" ? "at your home" : "putting up your lights";
  const head =
    v.status === "done" ? (v.kind === "takedown" ? "All packed up" : v.kind === "fix" ? "All set" : "Your lights are up!")
    : v.status === "here" ? `${v.lead}'s crew is at your home`
    : v.status === "next" && v.ahead === 0 ? "On the way to you now"
    : v.status === "next" ? "You're next"
    : v.status === "waiting" ? "Today's the day"
    : `${homes(v.ahead)} ahead of you`;
  const sub =
    v.status === "done" ? (v.completedAt ? `Finished at ${clock(v.completedAt)}. Thank you!` : "Thank you!")
    : v.status === "here" ? `They got there${v.arrivedAt ? ` at ${clock(v.arrivedAt)}` : ""} and are ${what}.`
    : v.status === "next" && v.ahead > 0 ? "The crew is finishing the home before yours."
    : v.status === "waiting" ? `${v.lead}'s crew hasn't started the day yet.${v.ahead ? ` There ${v.ahead === 1 ? "is 1 home" : `are ${v.ahead} homes`} before yours.` : " You're their first stop."}`
    : v.status === "later" ? `${v.lead}'s crew has finished ${homes(v.doneToday)} today.` : "";
  const eta = v.status === "next" || v.status === "later" || v.status === "waiting" ? window_(v.etaFrom, v.etaTo) : "";
  const points = [
    ...(v.home ? [{ id: "home", lat: v.home.lat, lng: v.home.lng, color: "#F10800", label: "Your home", big: true }] : []),
    ...(v.van ? [{ id: "van", lat: v.van.lat, lng: v.van.lng, color: "#F5A524", label: `${v.lead}'s crew (rough area)`, radiusM: 700, big: true }] : []),
  ];
  const total = v.doneToday + v.ahead + (v.status === "done" ? 0 : 1);
  return (
    <>
      <Card>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-11 h-11 rounded-full grid place-items-center ${v.status === "done" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {v.status === "done" ? <CheckCircle2 /> : v.status === "here" ? <Truck /> : <Clock />}
          </div>
          <div className="min-w-0">
            <p className="text-xl font-extrabold text-[#112E5B] leading-tight">{head}</p>
            {sub && <p className="text-slate-600 text-sm mt-1">{sub}</p>}
          </div>
        </div>
        {eta && (
          <div className="mt-4 rounded-xl bg-[#112E5B] text-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#F5A524]">Estimated arrival</div>
            <div className="text-2xl font-extrabold">{eta}</div>
            <div className="text-xs text-white/60">Updates as the crew finishes each home.</div>
          </div>
        )}
        {total > 1 && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-1.5" aria-label={`${v.doneToday} homes done, ${v.ahead} ahead of yours`}>
              {Array.from({ length: total }, (_, i) => {
                const lit = i < v.doneToday;
                const yours = v.status !== "done" && i === total - 1;
                return <span key={i} className={`w-4 h-5 rounded-b-full rounded-t-[40%] ${yours ? "bg-[#F10800] ring-2 ring-red-200" : lit ? "bg-[#F5A524] shadow-[0_0_8px_#F5A524]" : "bg-slate-200"}`} />;
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Each bulb is a home on today's route. Lit ones are done{v.status !== "done" ? "; the red one is yours" : ""}.</p>
          </div>
        )}
      </Card>
      {points.length > 0 && v.status !== "done" && (
        <div className="rounded-2xl overflow-hidden bg-white p-1">
          <SignMap points={points} height={280} fitKey={points.map((p) => p.id).join()} />
          {v.van && <p className="text-xs text-slate-500 px-2 py-1.5">The gold circle is roughly where the crew is now. Seen {clock(v.van.at)}.</p>}
        </div>
      )}
      <p className="text-center text-xs text-white/50">Checked {clock(v.updatedAt)}. Questions? Reply to our text.</p>
    </>
  );
}

const Card = ({ children }: { children: React.ReactNode }) => <div className="rounded-2xl bg-white text-slate-900 p-5 shadow-xl">{children}</div>;
