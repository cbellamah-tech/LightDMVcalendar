"use client";

/* Snaps waiting to upload, kept in the phone's own storage (IndexedDB) so a weak signal, a closed tab or
   a reload never loses one. Each is sent as: photo upload, then the snap record; then it's removed. */

export type Snap = { id: string; blob: Blob; at: number; lat?: number; lng?: number; accuracyM?: number; routeId?: string; photoUrl?: string; tries?: number; error?: string };

const DB = "ldmv-snaps", STORE = "snaps";
let dbp: Promise<IDBDatabase> | null = null;
const mem = new Map<string, Snap>(); // fallback when IndexedDB is blocked (private mode)

function db() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putSnap(s: Snap) { try { await tx("readwrite", (st) => st.put(s)); } catch { mem.set(s.id, s); } }
export async function delSnap(id: string) { mem.delete(id); try { await tx("readwrite", (st) => st.delete(id)); } catch {} }
export async function allSnaps(): Promise<Snap[]> {
  let list: Snap[] = [];
  try { list = await tx<Snap[]>("readonly", (st) => st.getAll() as IDBRequest<Snap[]>); } catch {}
  return [...list, ...mem.values()].sort((a, b) => a.at - b.at);
}

export const newSnapId = () => `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type Result = { stopId: string; stopName: string; routeId: string; created: boolean; pay: number };

/** Send one snap. Throws on failure; the snap stays queued for the next try. */
export async function sendSnap(s: Snap): Promise<Result> {
  if (!s.photoUrl) {
    const fd = new FormData();
    fd.append("file", new File([s.blob], "sign.jpg", { type: "image/jpeg" }));
    fd.append("folder", "signs/snaps");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.status === 401) { window.location.href = "/login?next=/signs/snap"; throw new Error("Signed out"); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.url) throw new Error(j.error || `Photo upload failed (${res.status})`);
    s.photoUrl = j.url;
    await putSnap(s); // the photo is up; a retry only re-sends the record
  }
  const res = await fetch("/api/signs/snap", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: s.id, photoUrl: s.photoUrl, lat: s.lat, lng: s.lng, accuracyM: s.accuracyM, at: s.at, routeId: s.routeId }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Save failed (${res.status})`);
  await delSnap(s.id);
  return j;
}
