import { distanceM } from "./geo";

type P = { lat: number; lng: number };

/** Shortest-looking order to visit every spot once, starting from `from` and ending wherever is best.
 *  Nearest-neighbour first, then 2-opt swaps until nothing improves. Straight-line distance,
 *  which is close enough inside a tight group of spots. */
export function planOrder<T extends P>(from: P, spots: T[]): T[] {
  if (spots.length < 2) return [...spots];
  const left = [...spots];
  const path: T[] = [];
  let cur: P = from;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(cur, left[i]) < distanceM(cur, left[bi])) bi = i;
    cur = left.splice(bi, 1)[0];
    path.push(cur as T);
  }
  const pts: P[] = [from, ...path];
  const d = (a: number, b: number) => distanceM(pts[a], pts[b]);
  for (let improved = true, rounds = 0; improved && rounds < 50; rounds++) {
    improved = false;
    for (let i = 1; i < pts.length - 1; i++) {
      for (let k = i + 1; k < pts.length; k++) {
        // Reverse pts[i..k]. The path is open, so past the last spot there's no edge to pay for.
        const before = d(i - 1, i) + (k + 1 < pts.length ? d(k, k + 1) : 0);
        const after = d(i - 1, k) + (k + 1 < pts.length ? d(i, k + 1) : 0);
        if (after + 0.5 < before) {
          pts.splice(i, k - i + 1, ...pts.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return pts.slice(1) as T[];
}

export const pathLengthM = (from: P, spots: P[]) =>
  spots.reduce((sum, s, i) => sum + distanceM(i ? spots[i - 1] : from, s), 0);

/** Google Maps directions through the next spots (Maps allows up to 9 stops in between). */
export function mapsMultiLink(from: P | null, spots: P[]) {
  const list = spots.slice(0, 10);
  if (!list.length) return "";
  const dest = list[list.length - 1];
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  if (from) u.searchParams.set("origin", `${from.lat},${from.lng}`);
  u.searchParams.set("destination", `${dest.lat},${dest.lng}`);
  if (list.length > 1) u.searchParams.set("waypoints", list.slice(0, -1).map((s) => `${s.lat},${s.lng}`).join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}
