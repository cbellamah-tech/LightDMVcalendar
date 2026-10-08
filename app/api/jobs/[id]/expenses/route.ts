import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getJobs, jobVisibleTo } from "@/lib/jobs";
import { listUsers } from "@/lib/users";
import { isOffice, type Session } from "@/lib/session";
import { changeExpenses, getJobExpenses, parseAmount } from "@/lib/expenses";

export const dynamic = "force-dynamic";

async function load(id: string, s: Session) {
  const job = (await getJobs())[id];
  const me = (await listUsers()).find((u) => u.id === s.uid);
  return job && jobVisibleTo(job, s, me) ? job : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  if (!(await load(params.id, s))) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ expenses: await getJobExpenses(params.id) });
}

/* Body: { add: { amount, photo?, note? } } | { none: true } | { edit: { id, amount, note? } } | { remove: id }
   The crew adds and removes their own; owners and the manager can change or remove any. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await requireRole();
  if (s instanceof NextResponse) return s;
  if (!(await load(params.id, s))) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const office = isOffice(s);
  const note = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);

  if (b.add) {
    const amount = parseAmount(b.add.amount);
    if (amount == null) return NextResponse.json({ error: "Type the total on the receipt." }, { status: 400 });
    const photo = typeof b.add.photo === "string" && b.add.photo ? b.add.photo.slice(0, 1000) : undefined;
    const expenses = await changeExpenses(params.id, (e) => {
      e.items.push({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, amount, photo, note: note(b.add.note), by: s.uid, byName: s.name, at: Date.now() });
      delete e.none;
    });
    return NextResponse.json({ expenses });
  }
  if (b.none) {
    const expenses = await changeExpenses(params.id, (e) => { if (!e.items.length) e.none = { byName: s.name, at: Date.now() }; });
    return NextResponse.json({ expenses });
  }
  const id = String(b.edit?.id ?? b.remove ?? "");
  const cur = (await getJobExpenses(params.id)).items.find((x) => x.id === id);
  if (!cur) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  if (!office && cur.by !== s.uid) return NextResponse.json({ error: "Only the office can change someone else's expense." }, { status: 403 });
  if (b.edit) {
    const amount = parseAmount(b.edit.amount);
    if (amount == null) return NextResponse.json({ error: "Enter a dollar amount." }, { status: 400 });
    const expenses = await changeExpenses(params.id, (e) => {
      const x = e.items.find((i) => i.id === id);
      if (x) { x.amount = amount; if ("note" in b.edit) x.note = note(b.edit.note); x.editedBy = s.name; }
    });
    return NextResponse.json({ expenses });
  }
  const expenses = await changeExpenses(params.id, (e) => { e.items = e.items.filter((i) => i.id !== id); });
  return NextResponse.json({ expenses });
}
