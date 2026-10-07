import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { DEFAULT_SETTINGS, getOrders, getSettings, ledger, parseOrder, saveOrders, saveSettings, setSold, Settings } from "@/lib/costs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Owners only (also gated in middleware). GET = the whole ledger; POST { action, ... } changes it. */
export async function GET(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const url = new URL(req.url);
  const data = await ledger({
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    refreshSold: url.searchParams.get("sold") !== "0",
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const s = await requireRole("owner");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "addOrder": {
        const o = parseOrder(body.order);
        const orders = await getOrders();
        orders.push({ ...o, id: `o${Date.now()}`, addedAt: Date.now(), addedBy: s.name });
        await saveOrders(orders);
        return NextResponse.json({ ok: true });
      }
      case "saveOrder": {
        const o = parseOrder(body.order);
        const orders = await getOrders();
        const i = orders.findIndex((x) => x.id === body.order?.id);
        if (i < 0) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        orders[i] = { ...orders[i], ...o };
        await saveOrders(orders);
        return NextResponse.json({ ok: true });
      }
      case "deleteOrder": {
        await saveOrders((await getOrders()).filter((x) => x.id !== body.id));
        return NextResponse.json({ ok: true });
      }
      case "settings": {
        const cur = await getSettings();
        const next: Settings = { ...cur };
        for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
          if (body.settings?.[k] === undefined) continue;
          (next as any)[k] = typeof DEFAULT_SETTINGS[k] === "boolean" ? !!body.settings[k] : Math.max(0, Number(body.settings[k]) || 0);
        }
        if (next.runFt < 1) next.runFt = 1;
        await saveSettings(next);
        return NextResponse.json({ ok: true });
      }
      case "sold": {
        const amt = Number(String(body.amount ?? "").replace(/[$,\s]/g, ""));
        if (body.amount !== "" && body.amount != null && !(amt >= 0)) throw new Error("Sold price must be a number");
        await setSold(String(body.jobId), body.amount === "" || body.amount == null ? null : { amount: amt, source: "owner", at: Date.now() });
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
