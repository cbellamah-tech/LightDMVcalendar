export type Stop = {
  id: string; routeId: string; order: number; name: string; lat: number; lng: number; type: string;
  near?: string; nearM?: number; homesNearby?: number; state?: string; photoRequired: boolean; radiusM: number; notes?: string;
  cluster?: string; addedBy?: string; addedAt?: number;
};
export type Route = { id: string; name: string; rank?: number; state?: string; stops: Stop[]; assignedCrew?: string; assignedUser?: string };
export type RouteSummary = {
  id: string; name: string; rank?: number; state?: string; assignedCrew?: string; assignedUser?: string;
  stops: number; groups: number; visited: number; lastAt?: number; lat: number; lng: number;
};
export type Visit = {
  id: string; stopId: string; routeId: string; by: string; byName: string; at: number;
  status: "placed" | "still_there" | "replaced" | "skipped"; lat?: number; lng?: number; accuracyM?: number;
  distanceM?: number; photoUrl?: string; note?: string;
};
export type LivePos = { uid: string; name: string; lat: number; lng: number; accuracyM?: number; at: number; routeId?: string };
export type SignsData = {
  routes: RouteSummary[]; live: LivePos[]; office: boolean;
  meta?: { importedAt: number; source: string; routes: number; stops: number; by?: string } | null;
  me: { uid: string; name: string; role: string; crew?: string };
};
export type RouteData = { route: Route; lastVisit: Record<string, Visit>; me: SignsData["me"] };
export type NearStop = Stop & { routeName: string; d: number };

export const STATUS_COLOR: Record<string, string> = {
  none: "#94A3B8", placed: "#1F9D55", still_there: "#1F9D55", replaced: "#D97706", skipped: "#DC2626",
};
export const STATUS_LABEL: Record<string, string> = {
  none: "Not visited", placed: "Sign placed", still_there: "Still there", replaced: "Was missing, replaced", skipped: "Couldn't place",
};
export const CREW_LABEL: Record<string, string> = { crew1: "Crew 1 (Gary)", crew2: "Crew 2 (Sayed)" };
