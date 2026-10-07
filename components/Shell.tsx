"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, GraduationCap, Home, LogOut, MapPin, Settings, Users } from "lucide-react";
import { api, Me, NAVY } from "./ui";

const TABS = [
  { href: "/", label: "Home", icon: Home, roles: ["owner", "manager", "lead", "crew"] },
  { href: "/signs", label: "Yard signs", icon: MapPin, roles: ["owner", "manager", "lead", "crew"] },
  { href: "/jobs", label: "Jobs", icon: ClipboardCheck, roles: ["owner", "manager", "lead", "crew"] },
  { href: "/training", label: "Training", icon: GraduationCap, roles: ["owner", "manager", "lead", "crew"] },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, roles: ["owner"] },
  { href: "/people", label: "People", icon: Users, roles: ["owner", "manager"] },
  { href: "/settings/jobber", label: "Jobber", icon: Settings, roles: ["owner", "manager"] },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const bare = path.startsWith("/login");

  useEffect(() => {
    if (!bare) api<Me>("/api/me").then(setMe).catch(() => {});
  }, [bare]);

  if (bare) return <>{children}</>;
  const tabs = TABS.filter((t) => !me || t.roles.includes(me.role));
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header style={{ background: NAVY }} className="text-white sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-extrabold tracking-tight text-lg whitespace-nowrap">Light DMV</Link>
          <nav className="hidden md:flex gap-1 flex-1">
            {tabs.map((t) => (
              <Link key={t.href} href={t.href}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${active(t.href) ? "bg-white/20" : "hover:bg-white/10"}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1 md:flex-none" />
          {me && <span className="text-sm opacity-80 hidden sm:inline">{me.name}</span>}
          <button
            aria-label="Sign out"
            className="p-2 rounded-md hover:bg-white/10"
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main>{children}</main>
      {/* Phone tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-[1000] flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.slice(0, 5).map((t) => (
          <Link key={t.href} href={t.href}
            className="flex-1 flex flex-col items-center py-2 text-[11px] font-semibold"
            style={{ color: active(t.href) ? NAVY : "#94A3B8" }}>
            <t.icon size={20} />
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
