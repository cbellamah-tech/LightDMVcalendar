import { kvGet, kvSet } from "./store";
import { addDays, etDay } from "./marketing";

/* Paid ads: Facebook (Meta Marketing API, read-only token in Vercel) and Google Ads (a script inside the
   Google Ads account posts its daily numbers to /api/marketing/bot/ads). Spend, clicks and leads per day. */

export type AdSource = "facebook" | "google" | "lsa"; // lsa = Google Local Services, sent by the same Google Ads script
export type AdDay = { source: AdSource; day: string; spend: number; clicks: number; impressions: number; leads: number };
const DAYS = "ldmv:mkt:ads";
const META_AT = "ldmv:mkt:ads:meta-at";

export const metaConfigured = () => !!(process.env.META_ADS_TOKEN?.trim() && process.env.META_AD_ACCOUNT_ID?.trim());
const n = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0);

export async function recordAds(rows: AdDay[]) {
  const all = (await kvGet<Record<string, AdDay>>(DAYS)) ?? {};
  for (const r of rows) all[`${r.source}|${r.day}`] = r;
  const cutoff = addDays(etDay(Date.now()), -400);
  for (const k of Object.keys(all)) if (all[k].day < cutoff) delete all[k];
  await kvSet(DAYS, all);
  return rows.length;
}

const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];

/** Last 30 days from Meta, at most once an hour (or forced by the daily cron). */
export async function syncMetaAds(force = false) {
  if (!metaConfigured()) return { skipped: "META_ADS_TOKEN / META_AD_ACCOUNT_ID not set" };
  const last = (await kvGet<number>(META_AT)) ?? 0;
  if (!force && Date.now() - last < 60 * 60_000) return { skipped: "fresh" };
  const acct = process.env.META_AD_ACCOUNT_ID!.trim().replace(/^act_/, "");
  const u = new URL(`https://graph.facebook.com/v21.0/act_${acct}/insights`);
  u.searchParams.set("fields", "spend,clicks,impressions,actions");
  u.searchParams.set("date_preset", "last_30d");
  u.searchParams.set("time_increment", "1");
  u.searchParams.set("limit", "100");
  const r = await fetch(u, { headers: { Authorization: `Bearer ${process.env.META_ADS_TOKEN!.trim()}` }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Facebook ads: ${j?.error?.message ?? r.status}`);
  const rows: AdDay[] = (j.data ?? []).map((d: any) => {
    // Meta reports several overlapping lead action types; the biggest one is the real count.
    const leads = Math.max(0, ...(d.actions ?? []).filter((a: any) => LEAD_ACTIONS.includes(a.action_type)).map((a: any) => n(a.value)));
    return { source: "facebook", day: d.date_start, spend: n(d.spend), clicks: n(d.clicks), impressions: n(d.impressions), leads };
  });
  await recordAds(rows);
  await kvSet(META_AT, Date.now());
  return { days: rows.length };
}

export type AdTotals = { spend: number; clicks: number; leads: number; lastDay?: string };
const sum = (rows: AdDay[]): AdTotals => ({
  spend: Math.round(rows.reduce((a, r) => a + r.spend, 0)),
  clicks: rows.reduce((a, r) => a + r.clicks, 0),
  leads: rows.reduce((a, r) => a + r.leads, 0),
  lastDay: rows.map((r) => r.day).sort().pop(),
});

export const allAdDays = async () => Object.values((await kvGet<Record<string, AdDay>>(DAYS)) ?? {});

export async function adsSummary() {
  let error: string | undefined;
  let all = Object.values((await kvGet<Record<string, AdDay>>(DAYS)) ?? {});
  if (!all.length) {
    await syncMetaAds().catch((e) => { error = e.message; });
    all = Object.values((await kvGet<Record<string, AdDay>>(DAYS)) ?? {});
  } else if (metaConfigured() && Date.now() - ((await kvGet<number>(META_AT)) ?? 0) >= 60 * 60_000) {
    // Saved numbers show at once; Facebook is re-read (at most hourly) after the page has its answer.
    const { laterOnce } = await import("./background");
    await laterOnce("meta-ads", () => syncMetaAds(), 60_000);
  }
  const today = etDay(Date.now()), weekAgo = addDays(today, -7), month = today.slice(0, 7);
  const by = (s: AdSource) => {
    const rows = all.filter((r) => r.source === s);
    return { has: rows.length > 0, week: sum(rows.filter((r) => r.day > weekAgo)), month: sum(rows.filter((r) => r.day.startsWith(month))) };
  };
  return { facebook: { ...by("facebook"), configured: metaConfigured() }, google: by("google"), lsa: by("lsa"), error };
}
