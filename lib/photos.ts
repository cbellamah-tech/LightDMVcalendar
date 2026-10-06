import { put } from "@vercel/blob";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* Photo storage, first one available:
   1. Supabase Storage (bucket "ldmv-photos", created automatically) when Supabase is connected.
   2. Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
   3. Memory, so local testing works. */

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "ldmv-photos";
let sb: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function supabase() {
  if (!SB_URL || !SB_KEY) return null;
  sb ??= createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  bucketReady ??= sb.storage.createBucket(BUCKET, { public: true }).then(({ error }) => {
    if (error && !/already exists/i.test(error.message)) { bucketReady = null; throw error; }
  });
  return sb;
}

export const photoStore = () => (SB_URL && SB_KEY ? "supabase" : process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "memory");

const g = globalThis as unknown as { __ldmvPhotos?: Map<string, { type: string; data: Buffer }> };
const mem = (g.__ldmvPhotos ??= new Map());

export async function savePhoto(file: File, folder: string): Promise<string> {
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 120) || "misc";
  const client = supabase();
  if (client) {
    await bucketReady;
    const path = `${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`photos/${safeFolder}/${Date.now()}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || "image/jpeg",
    });
    return blob.url;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  mem.set(id, { type: file.type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()) });
  return `/api/photos/${id}`;
}

export const getMemPhoto = (id: string) => mem.get(id);
