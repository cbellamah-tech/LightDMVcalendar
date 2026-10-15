import { kvGet, kvGetMany, kvSet, kvSetMany } from "./store";
import { ghl, listIn, loc } from "./ghl";
import type { CxMsg, CxNote } from "./cxJobber";

/* GoHighLevel's side of the owners' customer database: every contact, every conversation's messages
   (texts, calls, emails) and every contact note. Pages are small so each call stays inside the function time limit. */

export type GContact = {
  id: string; name: string; phones: string[]; emails: string[]; address?: string; tags: string[]; source?: string;
  dateAdded?: string; dateUpdated?: string;
};
export type GMsgs = { at: number; msgs: CxMsg[] };
export type GNotes = { at: number; notes: CxNote[] };

export const GC = "ldmv:cx:gc:";
export const GM = "ldmv:cx:gm:";
export const GN = "ldmv:cx:gn:";
const MSG_QUEUE = "ldmv:cx:gmq";   // conversations whose messages need reading: [conversationId, contactId]
const NOTE_QUEUE = "ldmv:cx:gnq";  // contacts whose notes need reading

/** GoHighLevel answers 401/403 when the Private Integration key is missing a scope. */
export const ghlScopeHint = (e: any) =>
  /\((401|403)\)/.test(String(e?.message))
    ? `${e.message}. In GoHighLevel, Settings > Private Integrations, edit the app's key and tick View Contacts, View Conversations and View Conversation Messages.`
    : String(e?.message ?? e);

const clip = (s: any, n = 4000) => String(s ?? "").trim().slice(0, n);
const iso = (v: any) => { const t = typeof v === "number" ? v : Date.parse(v ?? ""); return t ? new Date(t).toISOString() : undefined; };

function parseContact(c: any): GContact {
  const name = clip(c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.companyName || c.email || c.phone || "Unnamed", 120);
  const phones = [c.phone, ...(c.additionalPhones ?? []).map((p: any) => p?.phone ?? p)].filter(Boolean).map(String);
  const emails = [c.email, ...(c.additionalEmails ?? []).map((p: any) => p?.email ?? p)].filter(Boolean).map(String);
  const address = [c.address1, c.city, c.state, c.postalCode].filter(Boolean).join(", ") || undefined;
  return {
    id: String(c.id), name, phones: [...new Set(phones)], emails: [...new Set(emails)], address, tags: (c.tags ?? []).map(String),
    source: c.source ? String(c.source) : undefined, dateAdded: iso(c.dateAdded), dateUpdated: iso(c.dateUpdated ?? c.dateAdded),
  };
}

async function pushQueue<T>(key: string, items: T[], id: (x: T) => string) {
  if (!items.length) return;
  const cur = (await kvGet<T[]>(key)) ?? [];
  const seen = new Set(cur.map(id));
  for (const x of items) if (!seen.has(id(x))) { cur.push(x); seen.add(id(x)); }
  await kvSet(key, cur);
}
export const queueSizes = async () => {
  const [m, n] = await kvGetMany<unknown[]>([MSG_QUEUE, NOTE_QUEUE]);
  return { messages: m?.length ?? 0, notes: n?.length ?? 0 };
};

/** One page of contacts, most recently changed first. `since` stops at the first contact older than it.
    Every contact on the page has its notes queued (GoHighLevel doesn't say when a note was added). */
export async function ghlContactsPage(cursor: string | null, since?: string): Promise<{ count: number; next: string | null }> {
  const after = cursor ? JSON.parse(cursor) : null;
  const j = await ghl(`/contacts/search`, {
    method: "POST",
    body: {
      locationId: loc(), pageLimit: 100, sort: [{ field: "dateUpdated", direction: "desc" }],
      ...(after?.searchAfter ? { searchAfter: after.searchAfter } : { page: after?.page ?? 1 }),
    },
  });
  const list: any[] = listIn(j, ["contacts"]);
  let contacts = list.map(parseContact);
  const sinceT = since ? Date.parse(since) : 0;
  const stop = sinceT > 0 && contacts.some((c) => Date.parse(c.dateUpdated ?? "") < sinceT);
  if (sinceT) contacts = contacts.filter((c) => Date.parse(c.dateUpdated ?? "") >= sinceT);
  await kvSetMany(contacts.map((c) => [GC + c.id, c]));
  await pushQueue(NOTE_QUEUE, contacts.map((c) => c.id), (x) => x);
  const last = list[list.length - 1];
  const next = stop || list.length < 100 ? null
    : JSON.stringify(Array.isArray(last?.searchAfter) ? { searchAfter: last.searchAfter } : { page: (after?.page ?? 1) + 1 });
  return { count: contacts.length, next };
}

/** One page of conversations, newest message first. Queues the ones with messages since `since` (all of them without it). */
export async function ghlConversationsPage(cursor: string | null, since?: string): Promise<{ count: number; next: string | null }> {
  const q = new URLSearchParams({ locationId: loc(), limit: "100", sortBy: "last_message_date", sort: "desc" });
  if (cursor) q.set("startAfterDate", cursor);
  const list: any[] = listIn(await ghl(`/conversations/search?${q}`), ["conversations"]);
  const sinceT = since ? Date.parse(since) : 0;
  const when = (c: any) => Number(c.lastMessageDate) || Date.parse(c.lastMessageDate ?? c.dateUpdated ?? "") || 0;
  const fresh = list.filter((c) => c.contactId && (!sinceT || when(c) >= sinceT));
  await pushQueue<[string, string]>(MSG_QUEUE, fresh.map((c) => [String(c.id), String(c.contactId)]), (x) => x[0]);
  const stop = sinceT > 0 && list.some((c) => when(c) < sinceT);
  const last = list[list.length - 1];
  const next = stop || list.length < 100 ? null : String(last?.sort?.[0] ?? when(last));
  return { count: fresh.length, next };
}

const KIND: Record<string, string> = {
  TYPE_SMS: "Text", TYPE_CALL: "Call", TYPE_EMAIL: "Email", TYPE_FACEBOOK: "Facebook", TYPE_INSTAGRAM: "Instagram",
  TYPE_WHATSAPP: "WhatsApp", TYPE_GMB: "Google", TYPE_LIVE_CHAT: "Chat", TYPE_WEBCHAT: "Chat", TYPE_REVIEW: "Review",
  TYPE_ACTIVITY_CONTACT: "Activity", TYPE_ACTIVITY_OPPORTUNITY: "Activity", TYPE_ACTIVITY_APPOINTMENT: "Activity",
};
const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, "\n\n").trim();

function parseMsg(m: any): CxMsg | null {
  const kind = KIND[String(m.messageType)] ?? (m.messageType ? String(m.messageType).replace(/^TYPE_/, "").toLowerCase() : "Message");
  let text = clip(strip(String(m.body ?? "")));
  if (kind === "Call") {
    const secs = Number(m.meta?.call?.duration) || 0;
    text = [text, `Call${secs ? ` (${Math.max(1, Math.round(secs / 60))} min)` : ""}${m.meta?.call?.status ? `, ${m.meta.call.status}` : ""}`].filter(Boolean).join("\n");
  }
  if (kind === "Email" && m.meta?.email?.subject) text = [`Subject: ${m.meta.email.subject}`, text].filter(Boolean).join("\n");
  if (!text && m.attachments?.length) text = `${m.attachments.length} attachment${m.attachments.length > 1 ? "s" : ""}`;
  if (!text) return null;
  return { id: String(m.id), at: iso(m.dateAdded), dir: m.direction === "inbound" ? "in" : "out", kind, text, from: "GoHighLevel" };
}

async function readConversation(convId: string): Promise<CxMsg[]> {
  const out: CxMsg[] = [];
  let lastId = "";
  for (let page = 0; page < 3; page++) {
    const j = await ghl(`/conversations/${encodeURIComponent(convId)}/messages?limit=100${lastId ? `&lastMessageId=${encodeURIComponent(lastId)}` : ""}`);
    const box = j?.messages ?? j;
    const list: any[] = Array.isArray(box?.messages) ? box.messages : listIn(j, ["messages"]);
    for (const m of list) { const p = parseMsg(m); if (p) out.push(p); }
    if (!box?.nextPage || !box?.lastMessageId || !list.length) break;
    lastId = box.lastMessageId;
  }
  return out;
}

/** Read queued conversations until the deadline. Returns how many are left. */
export async function ghlDrainMessages(deadline: number): Promise<number> {
  const queue = (await kvGet<[string, string][]>(MSG_QUEUE)) ?? [];
  let done = 0;
  try {
    while (done < queue.length && Date.now() < deadline) {
      const batch = queue.slice(done, done + 4);
      const got = await Promise.all(batch.map(([conv]) => readConversation(conv)));
      const contacts = [...new Set(batch.map((b) => b[1]))];
      const have = await kvGetMany<GMsgs>(contacts.map((c) => GM + c));
      const writes: [string, GMsgs][] = contacts.map((c, i) => {
        const byId = new Map((have[i]?.msgs ?? []).map((m) => [m.id, m]));
        batch.forEach(([, who], k) => { if (who === c) for (const m of got[k]) byId.set(m.id, m); });
        return [GM + c, { at: Date.now(), msgs: [...byId.values()].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 400) }];
      });
      await kvSetMany(writes);
      done += batch.length;
    }
  } finally {
    // Re-read the queue so conversations queued meanwhile aren't lost.
    const now = (await kvGet<[string, string][]>(MSG_QUEUE)) ?? [];
    const finished = new Set(queue.slice(0, done).map((x) => x[0]));
    const left = now.filter((x) => !finished.has(x[0]));
    await kvSet(MSG_QUEUE, left);
  }
  return Math.max(0, queue.length - done);
}

async function readNotes(contactId: string): Promise<CxNote[]> {
  const j = await ghl(`/contacts/${encodeURIComponent(contactId)}/notes`);
  return listIn(j, ["notes"]).map((n: any) => ({ at: iso(n.dateAdded ?? n.createdAt), text: clip(strip(String(n.body ?? "")), 6000), from: "GoHighLevel note" }))
    .filter((n) => n.text);
}

/** Read queued contacts' notes until the deadline. Returns how many are left. */
export async function ghlDrainNotes(deadline: number): Promise<number> {
  const queue = (await kvGet<string[]>(NOTE_QUEUE)) ?? [];
  let done = 0;
  try {
    while (done < queue.length && Date.now() < deadline) {
      const batch = queue.slice(done, done + 5);
      const got = await Promise.all(batch.map((c) => readNotes(c).catch((e) => { if (/\((401|403)\)/.test(e.message)) throw e; return null; })));
      await kvSetMany(batch.flatMap((c, i) => (got[i] ? [[GN + c, { at: Date.now(), notes: got[i]! }] as [string, GNotes]] : [])));
      done += batch.length;
    }
  } finally {
    const now = (await kvGet<string[]>(NOTE_QUEUE)) ?? [];
    const finished = new Set(queue.slice(0, done));
    await kvSet(NOTE_QUEUE, now.filter((x) => !finished.has(x)));
  }
  return Math.max(0, queue.length - done);
}

/** Fresh notes and texts for one customer's contacts (when an owner opens the profile). */
export async function refreshContacts(contactIds: string[]) {
  for (const c of contactIds.slice(0, 6)) {
    const notes = await readNotes(c).catch(() => null);
    if (notes) await kvSet<GNotes>(GN + c, { at: Date.now(), notes });
    const convs = listIn(await ghl(`/conversations/search?locationId=${encodeURIComponent(loc())}&contactId=${encodeURIComponent(c)}&limit=20`).catch(() => ({})), ["conversations"]);
    if (!convs.length) continue;
    const msgs = (await Promise.all(convs.map((v: any) => readConversation(String(v.id)).catch(() => [] as CxMsg[])))).flat();
    const have = await kvGet<GMsgs>(GM + c);
    const byId = new Map((have?.msgs ?? []).map((m) => [m.id, m]));
    for (const m of msgs) byId.set(m.id, m);
    await kvSet<GMsgs>(GM + c, { at: Date.now(), msgs: [...byId.values()].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 400) });
  }
}

/** GoHighLevel's page for a contact. */
export const ghlContactUrl = (id: string) => `https://app.gohighlevel.com/v2/location/${encodeURIComponent(loc())}/contacts/detail/${encodeURIComponent(id)}`;
