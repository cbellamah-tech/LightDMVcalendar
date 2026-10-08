export type Job = {
  id: string; source: "jobber" | "sample"; jobNumber?: number; title: string; client: string; address: string;
  start: string; end?: string; kind: "install" | "takedown"; crew?: string; assignedNames: string[];
};
export type Progress = { done: number; total: number; requiredLeft: string[] };
export type CheckEntry = { done: boolean; by?: string; byName?: string; at?: number; photos: string[]; note?: string; counts?: Record<string, number> };
export type Checklist = { jobId: string; kind: string; items: Record<string, CheckEntry>; completedAt?: number; completedBy?: string; rev: number };
export type SopItem = { id: string; text: string; required?: boolean; photo?: boolean; noteLabel?: string; counts?: { key: string; label: string }[] };
export type DetailFile = { name: string; url: string; image: boolean };
export type JobDetail = {
  fetchedAt: number; error?: string; instructions?: string; quoteNumber?: string;
  lines: { name: string; description?: string; quantity?: number; images: DetailFile[] }[];
  notes: { from: "job" | "quote"; message: string; at?: string; files: DetailFile[] }[];
  clientTags: string[]; otherJobs: { jobNumber?: number; title?: string; createdAt?: string }[];
  repeat: boolean; repeatWhy?: string; bins: string[];
  drive: {
    bins: { bin: string; status: string; source: string }[];
    photos: { fileId: string; title: string; year: number; bin: string | null; thumb: string; link: string; sure: boolean }[];
    indexedAt: string | null;
  };
};
export type CrewPay = { amount: number | null; how: "set" | "rule" | "unknown" };
