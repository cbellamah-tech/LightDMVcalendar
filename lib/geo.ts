/** Distance in meters between two lat/lng points. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1609.34).toFixed(1)} mi`);

export const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
