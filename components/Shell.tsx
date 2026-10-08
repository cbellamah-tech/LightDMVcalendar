"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { getMe, Me, NAVY } from "./ui";
import { moreGroups, primaryTabs, ROLE_LABEL } from "@/lib/nav";

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [more, setMore] = useState(false);
  const bare = path.startsWith("/login");

  useEffect(() => {
    if (!bare) getMe().then(setMe).catch(() => {});
  }, [bare]);
  useEffect(() => setMore(false), [path]);

  if (bare) return <>{children}</>;
  // Until we know who this is, show only what a crew member gets, so a crew phone never flashes owner tabs.
  const role = me?.role ?? "crew";
  const tabs = primaryTabs(role);
  const groups = moreGroups(role);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`)) && !(href === "/install" && path.startsWith("/install/team"));
  const moreActive = groups.some((g) => g.tabs.some((t) => active(t.href)));
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header style={{ background: NAVY }} className="text-white sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-extrabold tracking-tight text-lg whitespace-nowrap">Light DMV</Link>
          <nav className="hidden md:flex gap-1 flex-1 items-center">
            {tabs.map((t) => (
              <Link key={t.href} href={t.href}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${active(t.href) ? "bg-white/20" : "hover:bg-white/10"}`}>
                {t.label}
              </Link>
            ))}
            {groups.length > 0 && (
              <DesktopMore groups={groups} active={active} highlighted={moreActive} />
            )}
          </nav>
          <div className="flex-1 md:flex-none" />
          {me && <span className="text-sm opacity-80 hidden sm:inline">{me.name} · {ROLE_LABEL[me.role]}</span>}
          <button aria-label="Sign out" className="p-2 rounded-md hover:bg-white/10" onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main>{children}</main>

      {/* Phone: the same tabs along the bottom, the rest behind More. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-[1000] flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((t) => (
          <Link key={t.href} href={t.href}
            className="flex-1 flex flex-col items-center py-2 text-[11px] font-semibold"
            style={{ color: active(t.href) ? NAVY : "#94A3B8" }}>
            <t.icon size={22} />
            {t.short ?? t.label}
          </Link>
        ))}
        {groups.length > 0 && (
          <button onClick={() => setMore(true)} className="flex-1 flex flex-col items-center py-2 text-[11px] font-semibold"
            style={{ color: moreActive ? NAVY : "#94A3B8" }}>
            <Menu size={22} />
            More
          </button>
        )}
      </nav>
      {more && (
        <div className="md:hidden fixed inset-0 z-[1100] bg-black/40 flex items-end" onClick={() => setMore(false)}>
          <div className="bg-white w-full rounded-t-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-extrabold" style={{ color: NAVY }}>{me ? `${me.name} · ${ROLE_LABEL[me.role]}` : "More"}</span>
              <button aria-label="Close" className="p-1" onClick={() => setMore(false)}><X size={20} /></button>
            </div>
            {groups.map((g) => (
              <div key={g.title}>
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">{g.title}</div>
                <div className="grid grid-cols-3 gap-2">
                  {g.tabs.map((t) => (
                    <Link key={t.href} href={t.href}
                      className={`rounded-xl border p-3 flex flex-col items-center gap-1 text-xs font-semibold text-center ${active(t.href) ? "border-[#112E5B] bg-slate-50" : "border-slate-200"}`}
                      style={{ color: NAVY }}>
                      <t.icon size={22} />
                      {t.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={signOut} className="w-full text-sm font-semibold text-slate-500 flex items-center justify-center gap-2 py-2">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Groups = ReturnType<typeof moreGroups>;

function DesktopMore({ groups, active, highlighted }: { groups: Groups; active: (href: string) => boolean; highlighted: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1 ${highlighted || open ? "bg-white/20" : "hover:bg-white/10"}`}>
        More <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 p-3 grid grid-cols-2 gap-x-6 gap-y-3 w-[440px]">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">{g.title}</div>
              {g.tabs.map((t) => (
                <Link key={t.href} href={t.href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-semibold hover:bg-slate-100 ${active(t.href) ? "bg-slate-100" : ""}`}
                  style={{ color: NAVY }}>
                  <t.icon size={16} /> {t.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
