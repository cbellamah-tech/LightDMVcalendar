"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, MapPin, Receipt, Settings, Users } from "lucide-react";
import { api, Me, NAVY } from "@/components/ui";

const TILES = [
  { href: "/signs", title: "Yard sign routes", text: "14 routes around the DMV. Start a route, drive, and the app asks for a photo at each sign.", icon: MapPin, roles: ["owner", "manager", "lead", "crew"] },
  { href: "/jobs", title: "Today's jobs", text: "Jobs from Jobber for your crew, with the install or takedown SOP checklist.", icon: ClipboardCheck, roles: ["owner", "manager", "lead", "crew"] },
  { href: "/calendar", title: "Owner calendar", text: "Chris and Liam's recurring task board.", icon: CalendarDays, roles: ["owner"] },
  { href: "/costs", title: "Costs", text: "What our lights cost, what each job used and made, and stock on hand.", icon: Receipt, roles: ["owner"] },
  { href: "/people", title: "People", text: "Add workers, set PINs, put people on crews.", icon: Users, roles: ["owner", "manager"] },
  { href: "/settings/jobber", title: "Jobber connection", text: "Connect Jobber and sync scheduled visits.", icon: Settings, roles: ["owner", "manager"] },
];

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  const tiles = TILES.filter((t) => !me || t.roles.includes(me.role));
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold pt-2" style={{ color: NAVY }}>{me ? `Hi ${me.name}` : "Light DMV"}</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="bg-white rounded-xl p-4 border border-slate-200 hover:shadow-md transition">
            <t.icon size={28} style={{ color: NAVY }} />
            <h2 className="font-bold mt-2">{t.title}</h2>
            <p className="text-sm text-slate-500">{t.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
