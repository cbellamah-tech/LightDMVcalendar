import { getMemPhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

// Local-only photo serving (when no Blob store is connected).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = getMemPhoto(params.id);
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.data), { headers: { "content-type": p.type, "cache-control": "private, max-age=86400" } });
}
