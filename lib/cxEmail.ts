import { kvGet, kvSet } from "./store";
import type { CxMsg } from "./cxJobber";

/* Emails between info@lightdmv.com and a customer, found in Gmail by the customer's email addresses and kept per
   household (ldmv:cx:em:<household>). Read in the background when a profile is opened or its summary is refreshed. */

export const EM = "ldmv:cx:em:";
export type CxEmails = { at: number; msgs: CxMsg[] };

const header = (m: any, name: string) => m?.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

function b64(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** The readable text of a message: its plain part (else its HTML with the tags taken out), without the quoted
    earlier messages a reply carries. */
function bodyOf(m: any): string {
  const parts: any[] = [];
  const walk = (p: any) => { if (!p) return; parts.push(p); (p.parts ?? []).forEach(walk); };
  walk(m.payload);
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  let t = plain ? b64(plain.body.data) : html ? b64(html.body.data).replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : String(m.snippet ?? "");
  t = t.split(/\n(?:On .{5,200}wrote:|-{2,} ?Original Message|From: .+\nSent: )/i)[0];
  t = t.split("\n").filter((l) => !l.startsWith(">")).join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t.slice(0, 3000);
}

/** Read the newest email threads with these addresses. Returns null when Google isn't connected. */
export async function refreshEmails(household: string, emails: string[]): Promise<CxEmails | null> {
  const { googleStatus, gapi } = await import("./google");
  const g = await googleStatus();
  if (!g.connected) return null;
  const me = g.email?.toLowerCase() ?? "info@lightdmv.com";
  const list = emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && !e.endsWith("@lightdmv.com")).slice(0, 5);
  const out: CxEmails = { at: Date.now(), msgs: [] };
  if (list.length) try {
    const q = encodeURIComponent(`{${list.map((e) => `from:${e} to:${e} cc:${e}`).join(" ")}} -in:spam -in:trash`);
    const found = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=15&q=${q}`);
    for (const t of found.threads ?? []) {
      const th = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=full`);
      for (const m of th.messages ?? []) {
        const from = addr(header(m, "From"));
        const subject = header(m, "Subject");
        const text = bodyOf(m);
        if (!text) continue;
        out.msgs.push({
          id: `em:${m.id}`, at: new Date(Number(m.internalDate) || Date.now()).toISOString(), dir: from === me ? "out" : "in", kind: "Email",
          text: subject ? `${subject}\n\n${text}` : text, from: "Gmail (info@lightdmv.com)",
        });
      }
    }
  } catch (e: any) {
    // Keep what we had and try again in 30 minutes.
    console.error("[cx emails]", e?.message ?? e);
    out.msgs = (await kvGet<CxEmails>(EM + household))?.msgs ?? [];
  }
  out.msgs.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  await kvSet(EM + household, out);
  return out;
}

export const savedEmails = (household: string) => kvGet<CxEmails>(EM + household);
