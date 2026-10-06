import { put } from "@vercel/blob";

/* Photo storage. Vercel Blob when BLOB_READ_WRITE_TOKEN is set (add a Blob store in the Vercel
   project's Storage tab); otherwise kept in memory so local testing works. */

const g = globalThis as unknown as { __ldmvPhotos?: Map<string, { type: string; data: Buffer }> };
const mem = (g.__ldmvPhotos ??= new Map());

export async function savePhoto(file: File, folder: string): Promise<string> {
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 120) || "misc";
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
