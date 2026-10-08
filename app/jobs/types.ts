export type Job = {
  id: string; source: "jobber" | "sample"; jobNumber?: number; title: string; client: string; address: string;
  start: string; end?: string; kind: "install" | "takedown" | "fix"; crew?: string; assignedNames: string[];
  request?: string; requestedAt?: string; doneInJobber?: boolean;
};
export type Progress = { done: number; total: number; requiredLeft: string[] };
export type CheckEntry = { done: boolean; by?: string; byName?: string; at?: number; photos: string[]; note?: string; counts?: Record<string, number>;
  parts?: Record<string, string>;   // photo url -> part of the job it shows (per-part photos)
  photoBy?: Record<string, string>; // photo url -> who took it
};
export type Checklist = { jobId: string; kind: string; items: Record<string, CheckEntry>; arrivedAt?: number; completedAt?: number; completedBy?: string; rev: number };
export type SopItem = { id: string; text: string; required?: boolean; photo?: boolean; perPart?: boolean; noteLabel?: string; counts?: { key: string; label: string }[] };
export type DetailFile = { name: string; url: string; image: boolean };
export type JobDetail = {
  fetchedAt: number; error?: string; instructions?: string; quoteNumber?: string;
  lines: { name: string; description?: string; quantity?: number; images: DetailFile[] }[];
  notes: { from: "job" | "quote"; message: string; at?: string; files: DetailFile[] }[];
  clientTags: string[]; otherJobs: { jobNumber?: number; title?: string; createdAt?: string }[];
  repeat: boolean; repeatWhy?: string; bins: string[];
  quoteMockups?: string[]; photoInfo?: string;
  drive: {
    bins: { bin: string; status: string; source: string }[];
    photos: DrivePhoto[];
    installPhotos?: DrivePhoto[];
    indexedAt: string | null;
  };
};
export type CrewPay = { amount: number | null; how: "set" | "rule" | "unknown" };
export type ReviewBonus = { reviewId: string; personId: string; person: string; amount: number; reviewer: string; at: number; how?: string };
export type DrivePhoto = { fileId: string; title: string; year: number; bin: string | null; thumb: string; link: string; sure: boolean };

/** "3 h 28 m" */
export const dur = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`; };
