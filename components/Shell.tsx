"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, LayoutGrid, LogOut, Search, X } from "lucide-react";
import { getMe, Me } from "./ui";
import CrewGps from "./CrewGps";
import { groupsFor, moreGroups, primaryTabs, ROLE_LABEL, Tab, TABS } from "@/lib/nav";

type Groups = ReturnType<typeof groupsFor>;

/* The frame around every page.
   Computer: a sidebar with every tab this person can open, grouped, plus "Find a page" (Ctrl+K).
   Phone and tablet: a top bar naming the page, the role's tabs along the bottom, everything else under More. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [sheet, setSheet] = useState(false);
  const bare = path.startsWith("/login") || path.startsWith("/t/"); // /t/ is a customer's tracker link

  useEffect(() => {
    if (!bare) getMe().then(setMe).catch(() => {});
  }, [bare]);
  useEffect(() => setSheet(false), [path]);

  if (bare) return <>{children}</>;
  // Until we know who this is, show only what a crew member gets, so a crew phone never flashes owner tabs.
  const role = me?.role ?? "crew";
  const tabs = primaryTabs(role);
  const groups = groupsFor(role);
  const more = moreGroups(role);
  const home = TABS.today.roles.includes(role) ? TABS.today : null;
  const all = [...(home ? [home] : []), ...tabs, ...groups.flatMap((g) => g.tabs)];
  // The deepest tab that matches wins, so /install/team is Crew training, not Installer Training.
  const current = all.filter((t) => (t.href === "/" ? path === "/" : path === t.href || path.startsWith(`${t.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const active = (href: string) => current?.href === href;
  const moreActive = more.some((g) => g.tabs.some((t) => active(t.href)));
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
      {/* Computer: sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 z-30 flex-col text-white"
        style={{ background: "linear-gradient(180deg, #0B1F3D 0%, #112E5B 100%)" }}>
        <Link href={home?.href ?? tabs[0]?.href ?? "/"} className="flex items-center gap-3 px-5 h-16 shrink-0">
          <Logo />
          <span className="leading-tight">
            <span className="block font-extrabold text-[17px] tracking-tight">Light DMV</span>
            <span className="block text-[11px] font-medium text-white/50">Crew and office app</span>
          </span>
        </Link>
        <div className="px-3 pb-2"><Finder tabs={dedupe(all)} dark /></div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5 scrollbar-none">
          {home && <SideLink t={home} on={active(home.href)} />}
          {groups.map((g) => (
            <div key={g.title}>
              <div className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[.12em] text-white/40">{g.title}</div>
              <div className="space-y-0.5">{g.tabs.map((t) => <SideLink key={t.href} t={t} on={active(t.href)} />)}</div>
            </div>
          ))}
        </nav>
        {me && (
          <div className="border-t border-white/10 p-3 flex items-center gap-3">
            <Avatar name={me.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-semibold truncate">{me.name}</div>
              <div className="text-xs text-white/50">{ROLE_LABEL[me.role]}</div>
            </div>
            <button aria-label="Sign out" title="Sign out" className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10" onClick={signOut}>
              <LogOut size={18} />
            </button>
          </div>
        )}
      </aside>

      {/* Phone and tablet: top bar */}
      <header className="lg:hidden sticky top-0 z-30 text-white" style={{ background: "#112E5B", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="px-4 h-14 flex items-center gap-3">
          <Link href={home?.href ?? tabs[0]?.href ?? "/"} aria-label="Light DMV home"><Logo /></Link>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="font-extrabold truncate text-[17px]">{current?.label ?? "Light DMV"}</div>
            {me && <div className="text-[11px] text-white/55 truncate">{me.name} · {ROLE_LABEL[me.role]}</div>}
          </div>
          <button aria-label="Menu" onClick={() => setSheet(true)} className="rounded-full">
            {me ? <Avatar name={me.name} /> : <span className="block w-9 h-9 rounded-full bg-white/10" />}
          </button>
        </div>
      </header>

      <main className="page-in">{children}</main>
      {me?.role === "lead" && <CrewGps />}

      {/* Phone and tablet: tabs along the bottom */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 flex px-1"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((t) => <BarLink key={t.href} label={t.short ?? t.label} icon={t.icon} href={t.href} on={active(t.href)} />)}
        {more.length > 0 && <BarLink label="More" icon={LayoutGrid} on={moreActive || sheet} onClick={() => setSheet(true)} />}
      </nav>

      {sheet && (
        <div className="lg:hidden fixed inset-0 z-[1100] bg-slate-900/50 flex items-end" onClick={() => setSheet(false)}>
          <div className="bg-[#F3F5F9] w-full rounded-t-3xl max-h-[88vh] overflow-y-auto shadow-2xl"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#F3F5F9] px-4 pt-2 pb-3 z-10">
              <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 mb-3" />
              <div className="flex items-center gap-3">
                {me && <Avatar name={me.name} navy />}
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-extrabold text-[#112E5B] truncate">{me?.name ?? "Menu"}</div>
                  {me && <div className="text-xs text-slate-500">{ROLE_LABEL[me.role]}</div>}
                </div>
                <button aria-label="Close" className="p-2 rounded-full bg-white border border-slate-200" onClick={() => setSheet(false)}><X size={18} /></button>
              </div>
              {all.length > 4 && <div className="mt-3"><Finder tabs={dedupe(all)} /></div>}
            </div>
            <div className="px-4 space-y-4">
              {groups.map((g) => (
                <section key={g.title}>
                  <div className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">{g.title}</div>
                  <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {g.tabs.map((t) => <SheetLink key={t.href} t={t} on={active(t.href)} />)}
                  </div>
                </section>
              ))}
              <button onClick={signOut} className="w-full rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 flex items-center justify-center gap-2 py-3">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const dedupe = (tabs: Tab[]) => tabs.filter((t, i) => tabs.findIndex((x) => x.href === t.href) === i);

function Logo() {
  return (
    <span className="relative w-9 h-9 rounded-xl grid place-items-center font-extrabold text-[15px] tracking-tight shrink-0 shadow-inner"
      style={{ background: "linear-gradient(135deg, #1D4380, #0B1F3D)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }}>
      <span className="text-white">L<span style={{ color: "#F5A524" }}>D</span></span>
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "#F5A524", boxShadow: "0 0 8px 2px rgba(245,165,36,.7)" }} />
    </span>
  );
}

function Avatar({ name, navy }: { name: string; navy?: boolean }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold shrink-0 ${navy ? "bg-[#112E5B] text-white" : "bg-white/15 text-white ring-1 ring-white/20"}`}>
      {initials}
    </span>
  );
}

function SideLink({ t, on }: { t: Tab; on: boolean }) {
  return (
    <Link href={t.href} aria-current={on ? "page" : undefined}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors ${on ? "bg-white/[.12] text-white" : "text-white/70 hover:text-white hover:bg-white/[.06]"}`}>
      {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: "#F5A524" }} />}
      <t.icon size={18} className={on ? "text-[#F5A524]" : ""} />
      <span className="truncate">{t.label}</span>
    </Link>
  );
}

function BarLink({ label, icon: Icon, href, on, onClick }: { label: string; icon: Tab["icon"]; href?: string; on: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className={`grid place-items-center w-14 h-8 rounded-full transition-colors ${on ? "bg-[#112E5B]/10" : ""}`}>
        <Icon size={21} strokeWidth={on ? 2.4 : 2} />
      </span>
      <span className="truncate max-w-full px-0.5">{label}</span>
    </>
  );
  const cls = `flex-1 min-w-0 flex flex-col items-center gap-0.5 pt-1.5 pb-1.5 text-[11px] font-semibold ${on ? "text-[#112E5B]" : "text-slate-400"}`;
  return href
    ? <Link href={href} aria-current={on ? "page" : undefined} className={cls}>{inner}</Link>
    : <button onClick={onClick} className={cls}>{inner}</button>;
}

function SheetLink({ t, on }: { t: Tab; on: boolean }) {
  return (
    <Link href={t.href} className={`flex items-center gap-3 px-3 py-3 ${on ? "bg-slate-50" : "active:bg-slate-50"}`}>
      <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${on ? "bg-[#112E5B] text-white" : "bg-slate-100 text-[#112E5B]"}`}><t.icon size={20} /></span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-[15px] text-slate-900">{t.label}</span>
        <span className="block text-xs text-slate-500 truncate">{t.text}</span>
      </span>
      <ChevronRight size={18} className="text-slate-300 shrink-0" />
    </Link>
  );
}

/** "Find a page": type a few letters, Enter opens the first match. Ctrl+K (or Cmd+K) jumps here on a computer. */
function Finder({ tabs, dark }: { tabs: Tab[]; dark?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const path = usePathname();
  useEffect(() => { setQ(""); setOpen(false); }, [path]);
  useEffect(() => {
    if (!dark) return;
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dark]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    // Names that start with what was typed first, then names that contain it, then pages whose description mentions it.
    const rank = (t: Tab) => {
      const name = `${t.label} ${t.short ?? ""}`.toLowerCase();
      return name.split(/\s+/).some((w) => w.startsWith(s)) ? 0 : name.includes(s) ? 1 : t.text.toLowerCase().includes(s) ? 2 : 3;
    };
    return tabs.map((t) => ({ t, r: rank(t) })).filter((x) => x.r < 3).sort((a, b) => a.r - b.r).map((x) => x.t);
  }, [q, tabs]);
  return (
    <div className="relative">
      <label className={`flex items-center gap-2 rounded-lg px-3 h-10 ${dark ? "bg-white/[.07] text-white/60 focus-within:bg-white/[.12]" : "bg-white border border-slate-200 text-slate-400"}`}>
        <Search size={16} className="shrink-0" />
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) window.location.assign(hits[0].href); if (e.key === "Escape") { setQ(""); ref.current?.blur(); } }}
          placeholder="Find a page" aria-label="Find a page"
          className={`flex-1 min-w-0 bg-transparent text-sm !border-0 !shadow-none !outline-none ${dark ? "text-white placeholder:text-white/50" : "text-slate-900 placeholder:text-slate-400"}`} />
        {dark && <kbd className="text-[10px] font-semibold text-white/40 border border-white/15 rounded px-1.5 py-0.5">Ctrl K</kbd>}
      </label>
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white text-slate-900 rounded-xl shadow-xl border border-slate-200 p-1 z-50 max-h-80 overflow-y-auto">
          {hits.length ? hits.map((t) => (
            <Link key={t.href} href={t.href} className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100">
              <t.icon size={17} className="text-[#112E5B] mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-xs text-slate-500 truncate">{t.text}</span>
              </span>
            </Link>
          )) : <div className="px-3 py-2 text-sm text-slate-500">No page called that.</div>}
        </div>
      )}
    </div>
  );
}
