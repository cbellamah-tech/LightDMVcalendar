import { kvGet, kvSet } from "./store";
import { addDays, etDay } from "./marketing";
import { gapi, googleStatus, grantedScopes, SCOPE_BUSINESS } from "./google";
import { explain } from "./googleInsights";

/* Google Business Profile: views on Search and Maps, website clicks, calls, chats, bookings and directions per day,
   for each Light DMV listing. Read through the app's Google connection (info@lightdmv.com manages the listings).
   Google only answers once the Business Profile APIs are approved for the app's Google Cloud project. */

const SNAP = "ldmv:gbp";
export type GbpDay = { day: string; searchDesktop: number; searchMobile: number; mapsDesktop: number; mapsMobile: number; website: number; calls: number; directions: number; conversations: number; bookings: number };
export type GbpLocation = { id: string; title: string; address?: string; days: GbpDay[] };
export type Gbp = { at: number; locations: GbpLocation[]; need?: string; link?: string; error?: string };

const METRICS: Record<string, keyof Omit<GbpDay, "day">> = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "searchDesktop",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "searchMobile",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "mapsDesktop",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "mapsMobile",
  WEBSITE_CLICKS: "website",
  CALL_CLICKS: "calls",
  BUSINESS_DIRECTION_REQUESTS: "directions",
  BUSINESS_CONVERSATIONS: "conversations",
  BUSINESS_BOOKINGS: "bookings",
};
const emptyDay = (day: string): GbpDay => ({ day, searchDesktop: 0, searchMobile: 0, mapsDesktop: 0, mapsMobile: 0, website: 0, calls: 0, directions: 0, conversations: 0, bookings: 0 });

export const getGbp = () => kvGet<Gbp>(SNAP);

async function locations(): Promise<{ id: string; title: string; address?: string }[]> {
  const acc = await gapi("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20");
  const out: { id: string; title: string; address?: string }[] = [];
  for (const a of acc.accounts ?? []) {
    const j = await gapi(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?pageSize=100&readMask=name,title,storefrontAddress`);
    for (const l of j.locations ?? []) {
      const ad = l.storefrontAddress;
      out.push({ id: String(l.name).split("/").pop()!, title: l.title, address: ad ? [ad.locality, ad.administrativeArea].filter(Boolean).join(", ") : undefined });
    }
  }
  return out;
}

/** Daily numbers for one listing over the last `days` days (Google runs a few days behind). */
export async function locationDays(id: string, days = 120): Promise<GbpDay[]> {
  const end = new Date(`${etDay(Date.now())}T12:00:00Z`), start = new Date(`${addDays(etDay(Date.now()), -days)}T12:00:00Z`);
  const q = new URLSearchParams();
  for (const m of Object.keys(METRICS)) q.append("dailyMetrics", m);
  const set = (k: string, d: Date) => {
    q.set(`dailyRange.${k}.year`, String(d.getUTCFullYear()));
    q.set(`dailyRange.${k}.month`, String(d.getUTCMonth() + 1));
    q.set(`dailyRange.${k}.day`, String(d.getUTCDate()));
  };
  set("start_date", start); set("end_date", end);
  const j = await gapi(`https://businessprofileperformance.googleapis.com/v1/locations/${id}:fetchMultiDailyMetricsTimeSeries?${q}`);
  const byDay = new Map<string, GbpDay>();
  for (const series of j.multiDailyMetricTimeSeries ?? []) {
    for (const s of series.dailyMetricTimeSeries ?? []) {
      const key = METRICS[s.dailyMetric];
      if (!key) continue;
      for (const v of s.timeSeries?.datedValues ?? []) {
        const d = v.date;
        const day = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        const row = byDay.get(day) ?? emptyDay(day);
        row[key] += Number(v.value ?? 0) || 0;
        byDay.set(day, row);
      }
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export async function refreshGbp(): Promise<Gbp | null> {
  if (!(await googleStatus()).connected) return null;
  const cur = await getGbp();
  let next: Gbp;
  if (!(await grantedScopes().catch(() => [] as string[])).includes(SCOPE_BUSINESS)) {
    next = { at: Date.now(), locations: cur?.locations ?? [], need: "Reconnect Google once so the app can read your Business Profile." };
  } else {
    try {
      const list = await locations();
      if (!list.length) next = { at: Date.now(), locations: [], need: "Make info@lightdmv.com a manager of the Light DMV Business Profile." };
      else next = { at: Date.now(), locations: await Promise.all(list.map(async (l) => ({ ...l, days: await locationDays(l.id) }))) };
    } catch (e) {
      const x = explain(e, "Business Profile");
      // A brand new Google Cloud project gets 0 requests a minute until Google approves Business Profile API access.
      if (/quota|rate ?limit|RESOURCE_EXHAUSTED|429/i.test(String((e as any)?.message)))
        Object.assign(x, { need: "Google has to approve Business Profile API access for the app once (a short Google form).", link: "https://support.google.com/business/contact/api_default", error: undefined });
      next = { at: Date.now(), locations: cur?.locations ?? [], ...x };
    }
  }
  await kvSet(SNAP, next);
  return next;
}
