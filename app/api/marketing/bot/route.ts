import { NextResponse } from "next/server";
import { addFeed, checkBotKey, getFeed, logCount } from "@/lib/marketing";
import { isChannel } from "@/lib/marketingData";

export const dynamic = "force-dynamic";

/* The bots' drop box. Every request carries "Authorization: Bearer <key>" (key on the Marketing tab).

   POST a report or a question:
     { "bot": "SEO", "title": "PR #72 passes", "body": "...", "link": "https://...",
       "ask": "Merge PR #72?", "options": ["Yes", "No"],
       "counts": { "blog": 1, "google_posts": 3 } }
   GET ?bot=SEO  ->  that bot's last 50 items with any owner answers, so it can act on them next run. */

const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined);

export async function POST(req: Request) {
  if (!(await checkBotKey(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const bot = str(b?.bot, 40), title = str(b?.title, 200);
  if (!bot || !title) return NextResponse.json({ error: "Send at least bot and title" }, { status: 400 });
  const link = str(b.link, 500);
  const options = Array.isArray(b.options) ? b.options.map((o: unknown) => str(o, 40)).filter(Boolean).slice(0, 4) as string[] : undefined;
  const item = await addFeed({
    bot, title, body: str(b.body, 4000), link: link && /^https:\/\//.test(link) ? link : undefined,
    ask: str(b.ask, 300), options: b.ask ? (options?.length ? options : ["Yes", "No"]) : undefined,
    area: b.area === "owners" || b.area === "marketing" ? b.area : undefined,
  });
  const logged: string[] = [];
  if (b.counts && typeof b.counts === "object")
    for (const [ch, v] of Object.entries(b.counts)) {
      const n = Math.round(Number(v));
      if (isChannel(ch) && n > 0 && n <= 100000) { await logCount({ channel: ch, n, by: bot, via: "bot", note: title }); logged.push(ch); }
    }
  return NextResponse.json({ id: item.id, logged });
}

export async function GET(req: Request) {
  if (!(await checkBotKey(req.headers.get("authorization")))) return NextResponse.json({ error: "Bad key" }, { status: 401 });
  const bot = new URL(req.url).searchParams.get("bot")?.toLowerCase();
  const items = (await getFeed()).filter((f) => !bot || f.bot.toLowerCase() === bot).slice(0, 50)
    .map(({ id, bot, title, ask, options, answer, at, dismissed }) => ({ id, bot, title, ask, options, answer, at, dismissed: !!dismissed }));
  return NextResponse.json({ items });
}
