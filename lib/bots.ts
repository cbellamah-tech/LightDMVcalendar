import Anthropic from "@anthropic-ai/sdk";
import { kvGet, kvUpdate } from "./store";
import { aiKey } from "./cxSummary";
import { addFeed, areaFor, BOT_AREA, etDay, getFeed, type BotArea, type FeedItem } from "./marketing";
import { getJobs } from "./jobs";

/* chris's bots (they used to be Grok tasks), living in the app. Each one is a job written in plain words, a schedule,
   and what it may look at in the app. Every morning the marketing cron hands off to /api/bots/cron, which runs the
   bots that are due on Claude (with web search) and posts each result to the same board the drop box fills, so
   answers to a bot's questions are waiting for it on its next run. The jobs live in the database, never in the repo. */

export type Every = "daily" | "weekdays" | "monday" | "monthly" | "manual";
export const EVERY: Record<Every, string> = {
  daily: "Every morning", weekdays: "Weekday mornings", monday: "Monday mornings", monthly: "1st of the month", manual: "Only when I tap Run",
};
export type Sees = "marketing" | "jobs";
export const SEES: Record<Sees, string> = { marketing: "Marketing numbers (leads, posts, ads, deals)", jobs: "Jobs coming up (counts by day and crew)" };

export type Bot = {
  name: string;
  job: string;           // the instructions, pasted from Grok or written here
  every: Every;
  sees: Sees[];
  area: BotArea;         // Briefing (owners) or Marketing
  lastRun?: number;
  lastDay?: string;      // ET day of the last scheduled run
  error?: string;
};

const KEY = "ldmv:bots";
const MODEL = "claude-opus-5-5";

const blank = (name: string): Bot => ({ name, job: "", every: "daily", sees: areaFor(name) === "owners" ? ["marketing", "jobs"] : ["marketing"], area: areaFor(name) });

/** The bots, starting from the ten chris ran in Grok. */
export async function getBots(): Promise<Bot[]> {
  return (await kvGet<Bot[]>(KEY)) ?? Object.keys(BOT_AREA).map(blank);
}

export async function saveBot(name: string, patch: Partial<Pick<Bot, "job" | "every" | "sees" | "area">>, add = false) {
  let out: Bot | undefined;
  await kvUpdate<Bot[]>(KEY, Object.keys(BOT_AREA).map(blank), (all) => {
    const i = all.findIndex((b) => b.name.toLowerCase() === name.toLowerCase());
    if (i < 0 && !add) return all;
    out = { ...(i < 0 ? blank(name) : all[i]), ...patch };
    return i < 0 ? [...all, out] : all.map((b, k) => (k === i ? out! : b));
  });
  return out;
}

export async function removeBot(name: string) {
  await kvUpdate<Bot[]>(KEY, Object.keys(BOT_AREA).map(blank), (all) => all.filter((b) => b.name.toLowerCase() !== name.toLowerCase()));
}

const patchRun = (name: string, p: Partial<Bot>) =>
  kvUpdate<Bot[]>(KEY, Object.keys(BOT_AREA).map(blank), (all) => all.map((b) => (b.name === name ? { ...b, ...p } : b)));

export function isDue(b: Bot, day = etDay(new Date())) {
  if (!b.job.trim() || b.every === "manual" || b.lastDay === day) return false;
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return b.every === "daily" || (b.every === "weekdays" && dow >= 1 && dow <= 5) || (b.every === "monday" && dow === 1) || (b.every === "monthly" && day.endsWith("-01"));
}

/* ---------- What a bot can see ---------- */

async function marketingFacts() {
  const { marketingDashboard } = await import("./marketingData");
  const d = await marketingDashboard({ days: 30 });
  return {
    week: d.week,
    channels: d.channels.map((c) => ({ channel: c.label, thisWeek: c.done, weeklyGoal: c.goal, lastWeek: c.lastWeek })),
    leadsThisWeek: d.ghl.weekLeads, leadsBySource: d.ghl.bySource,
    ads: d.ads, deals: d.deals.list,
  };
}

async function jobFacts() {
  const today = etDay(new Date());
  const jobs = Object.values(await getJobs()).filter((j) => j.source === "jobber");
  const ahead: Record<string, Record<string, number>> = {};
  for (const j of jobs) {
    const day = etDay(new Date(j.start));
    if (day < today || j.doneInJobber) continue;
    const k = `${j.kind}${j.crew ? ` (${j.crew})` : ""}`;
    (ahead[day] ??= {})[k] = (ahead[day][k] ?? 0) + 1;
  }
  const days = Object.keys(ahead).sort().slice(0, 21);
  return { today, openVisitsByDay: Object.fromEntries(days.map((d) => [d, ahead[d]])), doneSoFar: jobs.filter((j) => j.doneInJobber).length };
}

/* ---------- Running one ---------- */

const REPORT: Anthropic.Tool = {
  name: "report",
  description: "Post this run's result to the owners' board in the Light DMV app. Call it exactly once, at the end.",
  input_schema: {
    type: "object",
    required: ["title", "body"],
    properties: {
      title: { type: "string", description: "The result in one plain line, under 100 characters." },
      body: { type: "string", description: "The details in short plain sentences or short lines. Under 300 words. No markdown headings." },
      link: { type: "string", description: "One https link worth opening, if any." },
      ask: { type: "string", description: "Only if an owner must decide something: the question, answerable by tapping an option." },
      options: { type: "array", items: { type: "string" }, description: "2 to 4 short answers for the question (default Yes / No)." },
    },
  },
};

const SYSTEM = `You are one of the bots that help run Light DMV, a Christmas and holiday lighting installer in DC, Maryland and Virginia (owners Chris and Liam). You run on a schedule inside the company's app. Each run: do your job as written, using web search when it helps and the app data you're given, then call the report tool once. Write for a busy owner reading on a phone: lead with what matters, plain words, no filler. You can't log in to other sites or change anything; if your job needs that, say what the owner should do, or ask. Only ask a question when an owner's answer changes what you do next. Act on answers to your earlier questions.`;

export async function runBot(name: string): Promise<{ item?: FeedItem; error?: string }> {
  const b = (await getBots()).find((x) => x.name === name);
  if (!b) return { error: "No bot by that name." };
  if (!b.job.trim()) return { error: "Give this bot its job first." };
  const key = await aiKey();
  if (!key) return { error: "The app needs a Claude key first (paste it once at the top of this page)." };

  const day = etDay(new Date());
  await patchRun(b.name, { lastDay: day }); // claim today's run so a second cron call doesn't repeat it
  try {
    const [m, j, feed] = await Promise.all([
      b.sees.includes("marketing") ? marketingFacts().catch((e) => ({ error: e.message })) : null,
      b.sees.includes("jobs") ? jobFacts().catch((e) => ({ error: e.message })) : null,
      getFeed(),
    ]);
    const mine = feed.filter((f) => f.bot.toLowerCase() === b.name.toLowerCase()).slice(0, 8)
      .map((f) => ({ when: new Date(f.at).toISOString().slice(0, 10), title: f.title, ask: f.ask, answer: f.answer ? `${f.answer.by}: ${f.answer.value}${f.answer.note ? ` (${f.answer.note})` : ""}` : f.ask ? "not answered yet" : undefined }));
    const user = [
      `Today is ${day} (US Eastern). You are the ${b.name} bot.`,
      `YOUR JOB:\n${b.job.trim()}`,
      m && `MARKETING NUMBERS FROM THE APP:\n${JSON.stringify(m)}`,
      j && `JOBS FROM THE APP (Jobber):\n${JSON.stringify(j)}`,
      `YOUR LAST REPORTS AND THE OWNERS' ANSWERS:\n${mine.length ? JSON.stringify(mine) : "None yet; this is your first run here."}`,
    ].filter(Boolean).join("\n\n");

    const client = new Anthropic({ apiKey: key, timeout: 52_000, maxRetries: 0 });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
    let out: any;
    for (let turn = 0; turn < 3 && !out; turn++) {
      const r = await client.messages.create({
        model: MODEL, max_tokens: 6000, system: SYSTEM, output_config: { effort: "low" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 } as any, REPORT],
        messages,
      });
      out = r.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "report")?.input;
      if (out || r.stop_reason !== "pause_turn") {
        // No report call: keep its words as the report.
        if (!out) { const t = r.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n").trim(); if (t) out = { title: t.split("\n")[0].slice(0, 100), body: t }; }
        break;
      }
      messages.push({ role: "assistant", content: r.content });
    }
    if (!out?.title) throw new Error("The bot came back empty.");
    const s = (x: unknown, n: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, n) : undefined);
    const link = s(out.link, 500);
    const ask = s(out.ask, 300);
    const options = Array.isArray(out.options) ? out.options.map((o: unknown) => s(o, 40)).filter(Boolean).slice(0, 4) as string[] : [];
    const item = await addFeed({
      bot: b.name, area: b.area, title: s(out.title, 200)!, body: s(out.body, 4000), link: link && /^https:\/\//.test(link) ? link : undefined,
      ask, options: ask ? (options.length >= 2 ? options : ["Yes", "No"]) : undefined,
    });
    await patchRun(b.name, { lastRun: Date.now(), error: undefined });
    return { item };
  } catch (e) {
    const error = e instanceof Anthropic.AuthenticationError ? "The Claude key stopped working. Paste a new one at the top of this page."
      : e instanceof Anthropic.APIError ? `Claude: ${e.message}` : (e as Error)?.message ?? "The run failed.";
    await patchRun(b.name, { lastRun: Date.now(), error });
    return { error };
  }
}

/** The morning run: every bot that's due, side by side. */
export async function runDueBots() {
  const due = (await getBots()).filter((b) => isDue(b));
  const r = await Promise.allSettled(due.map((b) => runBot(b.name)));
  return due.map((b, i) => ({ bot: b.name, ok: r[i].status === "fulfilled" && !(r[i] as PromiseFulfilledResult<any>).value.error }));
}
