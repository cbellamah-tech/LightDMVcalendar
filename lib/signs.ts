import { parseCsv } from "./csv";
import { distanceM } from "./geo";
import { kvGet, kvSet, kvUpdate } from "./store";
// Draft stops from the "Plan 14 yard sign routes" thread, bundled so a fresh deploy has routes.
import bundledCsv from "../data/yard-signs/yard_sign_stops.csv";

export type StopType = "school" | "shopping center" | "intersection" | string;

export type Stop = {
  id: string;            // R01-S01
  routeId: string;
  order: number;
  name: string;
  lat: number;
  lng: number;
  type: StopType;
  near?: string;
  nearM?: number;
  homesNearby?: number;
  state?: string;
  photoRequired: boolean;
  radiusM: number;       // GPS arrival radius that triggers the photo prompt
  notes?: string;
  cluster?: string;      // a tight group of spots inside the route, worked in one go
  addedBy?: string;      // name of the crew member who added this spot in the field
  addedAt?: number;
};

export type Route = {
  id: string;            // R01
  name: string;
  rank?: number;         // 1 = best area
  state?: string;
  stops: Stop[];
  assignedCrew?: string; // crew1 / crew2
  assignedUser?: string; // a specific person
};

export type VisitStatus = "placed" | "still_there" | "replaced" | "skipped";
export const VISIT_LABEL: Record<VisitStatus, string> = {
  placed: "Sign placed",
  still_there: "Still there",
  replaced: "Was missing, replaced",
  skipped: "Couldn't place",
};

export type Visit = {
  id: string;
  stopId: string;
  routeId: string;
  by: string;
  byName: string;
  at: number;
  status: VisitStatus;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  distanceM?: number;    // how far from the stop the phone was when logged
  photoUrl?: string;
  note?: string;
};

export type LivePos = { uid: string; name: string; lat: number; lng: number; accuracyM?: number; at: number; routeId?: string };

const ROUTES = "ldmv:signs:routes";
const ROUTES_REV = "ldmv:signs:routes:rev"; // bumped on every write so each server can keep routes in memory
const META = "ldmv:signs:meta";
const VISITS = "ldmv:signs:visits"; // Record<stopId, Visit[]> newest first
const LIVE = "ldmv:signs:live";     // Record<uid, LivePos>

// Thousands of stops: read the big routes value only when another write has changed it.
let cache: { rev: number; routes: Route[] } | null = null;
async function readRoutes(): Promise<Route[] | null> {
  const rev = (await kvGet<number>(ROUTES_REV)) ?? 0;
  if (cache && cache.rev === rev) return cache.routes;
  const routes = await kvGet<Route[]>(ROUTES);
  if (routes) cache = { rev, routes };
  return routes;
}
async function writeRoutes(routes: Route[]) {
  await kvSet(ROUTES, routes);
  const rev = Date.now();
  await kvSet(ROUTES_REV, rev);
  cache = { rev, routes };
}
async function updateRoutes(fn: (routes: Route[]) => void) {
  const routes = structuredClone((await readRoutes()) ?? []);
  fn(routes);
  await writeRoutes(routes);
}

export type ImportMeta = { importedAt: number; source: string; routes: number; stops: number; by?: string; bundle?: string };

// Fingerprint of the bundled stop list, so a new list shipped in code replaces the old bundled one on its own.
const BUNDLE = (() => { let h = 0; for (let i = 0; i < bundledCsv.length; i++) h = (h * 31 + bundledCsv.charCodeAt(i)) | 0; return `${bundledCsv.length}:${h}`; })();
const BUNDLED_SOURCE = "bundled stop list (data/yard-signs/yard_sign_stops.csv)";

const truthy = (v: string) => /^(true|yes|1|y)$/i.test(v);
const num = (v: string) => (v === "" || v == null ? undefined : Number(v));

/** Parse a stops CSV with columns route_id, route_name, stop_order, stop_id, name, lat, lng, type,
 *  near, near_m, homes_nearby, state, photo_required, arrival_radius_m, notes, and optionally cluster (or group). */
export function routesFromCsv(text: string): Route[] {
  const rows = parseCsv(text);
  const byRoute = new Map<string, Route>();
  for (const r of rows) {
    const lat = Number(r.lat), lng = Number(r.lng);
    if (!r.route_id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    let route = byRoute.get(r.route_id);
    if (!route) {
      route = { id: r.route_id, name: r.route_name || r.route_id, rank: num(r.route_rank), state: r.state || undefined, stops: [] };
      byRoute.set(r.route_id, route);
    }
    const order = Number(r.stop_order) || route.stops.length + 1;
    route.stops.push({
      id: r.stop_id || `${r.route_id}-S${String(order).padStart(2, "0")}`,
      routeId: r.route_id,
      order,
      name: r.name || `Stop ${order}`,
      lat, lng,
      type: (r.type || "intersection") + (truthy(r.signal || "") ? " · traffic light" : ""),
      near: r.near || undefined,
      nearM: num(r.near_m),
      homesNearby: num(r.homes_nearby),
      state: r.state || undefined,
      photoRequired: r.photo_required === "" || r.photo_required == null ? true : truthy(r.photo_required),
      radiusM: num(r.arrival_radius_m) ?? 75,
      notes: r.notes || r.why_picked || r.why || undefined,
      // Prefer a readable group name over an id like R04-G2.
      cluster: (r.cluster_name || r.group_name || r.cluster || r.group || r.cluster_id || r.group_id || "").trim() || undefined,
    });
  }
  const routes = [...byRoute.values()];
  routes.forEach((rt) => rt.stops.sort((a, b) => a.order - b.order));
  return routes.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Replace routes and stops from a CSV. Re-runnable: keeps crew assignments by route id,
 *  and visit history stays keyed by stop id. */
export async function importRoutes(csv: string, source: string, by?: string, bundle?: string): Promise<ImportMeta> {
  const incoming = routesFromCsv(csv);
  if (!incoming.length) throw new Error("No stops found in that file. Check the column names.");
  const old = (await readRoutes()) ?? [];
  for (const r of incoming) {
    const prev = old.find((o) => o.id === r.id);
    if (prev) { r.assignedCrew = prev.assignedCrew; r.assignedUser = prev.assignedUser; }
    // Spots crews added in the field aren't in the CSV; keep them unless the CSV now has that stop id.
    const ids = new Set(r.stops.map((st) => st.id));
    let order = Math.max(0, ...r.stops.map((st) => st.order));
    for (const st of prev?.stops ?? []) if (st.addedAt && !ids.has(st.id)) r.stops.push({ ...st, order: ++order });
  }
  // A stop id that now points somewhere else (a redrawn list) shouldn't inherit the old spot's photos.
  const was = new Map(old.flatMap((r) => r.stops).map((st) => [st.id, st]));
  const moved = incoming.flatMap((r) => r.stops).filter((st) => { const o = was.get(st.id); return o && distanceM(o, st) > 100; }).map((st) => st.id);
  if (moved.length) await kvUpdate<Record<string, Visit[]>>(VISITS, {}, (all) => { for (const id of moved) delete all[id]; });
  await writeRoutes(incoming);
  const meta: ImportMeta = { importedAt: Date.now(), source, routes: incoming.length, stops: incoming.reduce((n, r) => n + r.stops.length, 0), by, bundle };
  await kvSet(META, meta);
  return meta;
}

export async function getRoutes(): Promise<Route[]> {
  const routes = await readRoutes();
  if (routes) {
    // Routes still on an older bundled list (not an owner's own upload) move to the new one.
    const meta = await kvGet<ImportMeta>(META);
    if (!meta || !meta.source.startsWith("bundled") || meta.bundle === BUNDLE) return routes;
  }
  await importBundled();
  return (await readRoutes()) ?? [];
}

export const importBundled = (by?: string) => importRoutes(bundledCsv, BUNDLED_SOURCE, by, BUNDLE);
export const getMeta = () => kvGet<ImportMeta>(META);

export async function assignRoute(routeId: string, crew?: string, user?: string) {
  await updateRoutes((routes) => {
    const r = routes.find((x) => x.id === routeId);
    if (r) { r.assignedCrew = crew || undefined; r.assignedUser = user || undefined; }
  });
}

export const getVisits = async () => (await kvGet<Record<string, Visit[]>>(VISITS)) ?? {};

export async function addVisit(v: Visit) {
  await kvUpdate<Record<string, Visit[]>>(VISITS, {}, (all) => {
    all[v.stopId] = [v, ...(all[v.stopId] ?? [])].slice(0, 25);
  });
}

export const getLive = async () => (await kvGet<Record<string, LivePos>>(LIVE)) ?? {};

export async function setLive(p: LivePos) {
  await kvUpdate<Record<string, LivePos>>(LIVE, {}, (all) => {
    all[p.uid] = p;
    // Drop positions older than 12 hours.
    for (const k of Object.keys(all)) if (Date.now() - all[k].at > 12 * 3600_000) delete all[k];
  });
}

export const routeVisibleTo = (r: Route, s: { uid: string; role: string; crew?: string }) =>
  s.role === "owner" || s.role === "manager" || r.assignedUser === s.uid || (!!s.crew && r.assignedCrew === s.crew) ||
  (!r.assignedUser && !r.assignedCrew);

/** A spot a crew added where they're standing. Joins the given route, or the route with the nearest stop.
 *  If a stop is already within 30 m, that stop is returned instead of making a duplicate. */
export async function addStop(at: { lat: number; lng: number }, by: string, visible: (r: Route) => boolean, routeId?: string, name?: string) {
  let result: Stop | undefined, created = false;
  await updateRoutes((routes) => {
    const mine = routes.filter(visible);
    let near: { s: Stop; d: number } | undefined;
    for (const r of mine) for (const st of r.stops) {
      const d = distanceM(at, st);
      if (!near || d < near.d) near = { s: st, d };
    }
    if (near && near.d <= 30) { result = near.s; return; }
    const route = mine.find((r) => r.id === routeId) || mine.find((r) => r.id === near?.s.routeId) || mine[0];
    if (!route) return;
    const order = Math.max(0, ...route.stops.map((st) => st.order)) + 1;
    result = {
      id: `${route.id}-N${Date.now().toString(36)}`,
      routeId: route.id,
      order,
      name: name || `New spot added by ${by}`,
      lat: at.lat, lng: at.lng,
      type: "added in the field",
      state: route.state,
      photoRequired: true,
      radiusM: 75,
      cluster: near?.s.routeId === route.id ? near.s.cluster : undefined,
      addedBy: by,
      addedAt: Date.now(),
    };
    route.stops.push(result);
    created = true;
  });
  if (!result) throw new Error("There's no route you can add a sign to.");
  return { stop: result, created };
}
