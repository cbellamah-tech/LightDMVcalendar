import { NextResponse } from "next/server";
import { gql } from "@/lib/jobber";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TEMPORARY probe: Jobber schema names only (no account data), to find where line item photos live.
const Q = `{ __schema { types { name kind fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }`;
const nm = (t: any): string => (t?.ofType ? nm(t.ofType) + (t.kind === "LIST" ? "[]" : "") : t?.name || "?");

export async function GET() {
  try {
    const d = await gql<{ __schema: { types: any[] } }>(Q, {});
    const types = d.__schema.types.filter((t) => !t.name.startsWith("__"));
    const pick = (re: RegExp) => types.filter((t) => re.test(t.name)).map((t) => ({ name: t.name, kind: t.kind, fields: (t.fields || []).map((f: any) => `${f.name}: ${nm(f.type)}`) }));
    const hits: string[] = [];
    for (const t of types) for (const f of t.fields || []) if (/image|photo|attach|file|media|picture|thumbnail/i.test(f.name)) hits.push(`${t.name}.${f.name}: ${nm(f.type)}`);
    return NextResponse.json({
      hits,
      lineItems: pick(/LineItem$|^LineItem|ProductOrService$|^File|Attachment|Image|Photo|Note$/),
      typeCount: types.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
