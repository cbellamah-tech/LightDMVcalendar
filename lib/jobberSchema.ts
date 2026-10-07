import { kvGet, kvSet } from "./store";

/* Jobber's GraphQL schema shifts between API versions, so detail queries are built from what the
   account's API says exists (introspection), cached for a day. A field that isn't there is simply left out. */

type TypeRef = { kind: string; name: string | null; ofType?: TypeRef | null };
type Field = { name: string; args: { name: string }[]; type: TypeRef };
type TypeInfo = { kind: string; fields: Field[]; possibleTypes: string[] };

/** What to select: `true` for a plain value, or { first?, sel } for an object or connection. */
export type Spec = { [field: string]: true | { first?: number; sel: Spec } };

const TYPE_Q = `query T($n: String!) { __type(name: $n) { kind possibleTypes { name }
  fields { name args { name } type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } }`;

const mem = new Map<string, TypeInfo | null>();

async function typeInfo(gql: <T>(q: string, v: Record<string, unknown>) => Promise<T>, name: string): Promise<TypeInfo | null> {
  if (mem.has(name)) return mem.get(name)!;
  const key = `ldmv:jobber:type:${name}`;
  const cached = await kvGet<{ at: number; t: TypeInfo | null }>(key);
  if (cached && Date.now() - cached.at < 86400_000) { mem.set(name, cached.t); return cached.t; }
  const d = await gql<{ __type: any }>(TYPE_Q, { n: name });
  const t = d.__type ? { kind: d.__type.kind, fields: d.__type.fields || [], possibleTypes: (d.__type.possibleTypes || []).map((p: any) => p.name) } : null;
  mem.set(name, t);
  await kvSet(key, { at: Date.now(), t });
  return t;
}

const named = (t: TypeRef): TypeRef => (t.ofType && (t.kind === "NON_NULL" || t.kind === "LIST") ? named(t.ofType) : t);
const isLeaf = (t: TypeRef) => ["SCALAR", "ENUM"].includes(named(t).kind);

/** Selection set for `typeName` holding only the fields in `spec` that exist. */
export async function buildSelection(gql: <T>(q: string, v: Record<string, unknown>) => Promise<T>, typeName: string, spec: Spec): Promise<string> {
  const t = await typeInfo(gql, typeName);
  if (!t) return "";
  if (t.kind === "UNION" || t.kind === "INTERFACE") {
    const parts: string[] = [];
    for (const p of t.possibleTypes) {
      const s = await buildSelection(gql, p, spec);
      if (s) parts.push(`... on ${p} ${s}`);
    }
    return parts.length ? `{ __typename ${parts.join(" ")} }` : "";
  }
  const out: string[] = [];
  for (const [name, want] of Object.entries(spec)) {
    const f = t.fields.find((x) => x.name === name);
    if (!f) continue;
    if (want === true) { if (isLeaf(f.type)) out.push(name); continue; }
    if (isLeaf(f.type)) { out.push(name); continue; }
    const inner = named(f.type).name!;
    let sel = await buildSelection(gql, inner, want.sel);
    // A plain list where we expected a connection: select the node fields directly.
    if (!sel && want.sel.nodes && want.sel.nodes !== true) sel = await buildSelection(gql, inner, want.sel.nodes.sel);
    if (!sel) continue;
    const args = want.first && f.args.some((a) => a.name === "first") ? `(first: ${want.first})` : "";
    out.push(`${name}${args} ${sel}`);
  }
  return out.length ? `{ ${out.join(" ")} }` : "";
}

/** Rows from a connection ({ nodes }), a plain list, or a single object. */
export const rows = (x: any): any[] => (x == null ? [] : Array.isArray(x) ? x : Array.isArray(x.nodes) ? x.nodes : [x]);
