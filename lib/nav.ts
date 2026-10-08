// Who sees which tab, in what order, and how the tabs group. The Shell (top bar, phone bar, More menu) and the
// home page both read this, so a tab only has to be added here once. The middleware still does the real gating.
import { CalendarDays, ClipboardCheck, GraduationCap, Hammer, Home, MapPin, Megaphone, Newspaper, Receipt, Settings, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { Me } from "@/components/ui";

export type Role = Me["role"];
export type Tab = { href: string; label: string; short?: string; text: string; icon: typeof Home; roles: Role[] };

const OFFICE: Role[] = ["owner", "manager"];
const OWNER: Role[] = ["owner"];
const EVERYONE: Role[] = ["owner", "manager", "lead", "crew"];

export const TABS: Record<string, Tab> = {
  today: { href: "/", label: "Today", text: "What's happening today.", icon: Home, roles: EVERYONE },
  jobs: { href: "/jobs", label: "Jobs", text: "Every install, takedown and fix, with the crew checklist and photos.", icon: ClipboardCheck, roles: EVERYONE },
  calendar: { href: "/calendar", label: "Calendar", text: "Chris and Liam's recurring task board.", icon: CalendarDays, roles: OWNER },
  signs: { href: "/signs", label: "Yard signs", text: "Sign routes: start one, drive, a photo at each stop.", icon: MapPin, roles: OFFICE },
  marketing: { href: "/marketing", label: "Marketing", text: "Leads by source, today's post, one-tap listings.", icon: Megaphone, roles: OFFICE },
  briefing: { href: "/briefing", label: "Briefing", text: "The owners' daily read on the business.", icon: Newspaper, roles: OWNER },
  training: { href: "/training", label: "Quote Creation Training", short: "Quotes", text: "Learn to build a quote on real houses.", icon: GraduationCap, roles: OFFICE },
  costs: { href: "/costs", label: "Costs", text: "What the lights cost, what each job made, stock on hand.", icon: Receipt, roles: OWNER },
  insurance: { href: "/insurance", label: "Insurance", text: "Who's covered, what's due, every policy.", icon: ShieldCheck, roles: OWNER },
  people: { href: "/people", label: "People", text: "Add workers, set PINs, put people on crews.", icon: Users, roles: OFFICE },
  install: { href: "/install", label: "Installer Training", short: "Training", text: "Every step of an install and a takedown.", icon: Hammer, roles: EVERYONE },
  crewTraining: { href: "/install/team", label: "Crew training", short: "My crew", text: "Where each person is in Installer Training; sign them off.", icon: UserCheck, roles: ["owner", "manager", "lead"] },
  jobber: { href: "/settings/jobber", label: "Jobber", text: "Jobber connection, sync and the Drive read.", icon: Settings, roles: OFFICE },
};

/** The bottom bar on a phone (and the first tabs on a computer), in the order each person uses them. */
const PRIMARY: Record<Role, (keyof typeof TABS)[]> = {
  owner: ["today", "jobs", "marketing", "calendar"],
  manager: ["today", "jobs", "marketing", "signs"],
  lead: ["today", "jobs", "install", "crewTraining"],
  crew: ["today", "jobs", "install"],
};

/** Everything else, grouped by what it's for. A group a role can't see anything in disappears. */
const GROUPS: { title: string; tabs: (keyof typeof TABS)[] }[] = [
  { title: "Run the day", tabs: ["jobs", "calendar", "signs"] },
  { title: "Bring in work", tabs: ["marketing", "briefing", "training"] },
  { title: "Money and papers", tabs: ["costs", "insurance"] },
  { title: "Team", tabs: ["people", "install", "crewTraining", "jobber"] },
];

export const primaryTabs = (role: Role) => PRIMARY[role].map((k) => TABS[k]);
export const groupsFor = (role: Role) =>
  GROUPS.map((g) => ({ title: g.title, tabs: g.tabs.map((k) => TABS[k]).filter((t) => t.roles.includes(role)) })).filter((g) => g.tabs.length);
/** The tabs that live under More (not already in the bar). */
export const moreGroups = (role: Role) => {
  const inBar = new Set(PRIMARY[role].map((k) => TABS[k].href));
  return groupsFor(role).map((g) => ({ ...g, tabs: g.tabs.filter((t) => !inBar.has(t.href)) })).filter((g) => g.tabs.length);
};

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Office", lead: "Crew lead", crew: "Crew" };
