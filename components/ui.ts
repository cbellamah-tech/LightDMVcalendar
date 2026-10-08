export const NAVY = "#112E5B";
export const RED = "#F10800";
export const GREEN = "#1F9D55";

export type Me = { uid: string; name: string; role: "owner" | "manager" | "lead" | "crew"; crew?: string };

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const fmtTime = (iso: string | number) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const fmtDay = (iso: string | number) =>
  new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
export const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : fmtDay(t);
};

/** Who's signed in, asked once per page load and shared by the Shell and the page. */
let mePromise: Promise<Me> | null = null;
export const getMe = () => (mePromise ??= api<Me>("/api/me").catch((e) => { mePromise = null; throw e; }));
