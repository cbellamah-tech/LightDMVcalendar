export type Job = {
  id: string; source: "jobber" | "sample"; jobNumber?: number; title: string; client: string; address: string;
  start: string; end?: string; kind: "install" | "takedown"; crew?: string; assignedNames: string[];
};
export type Progress = { done: number; total: number; requiredLeft: string[] };
export type CheckEntry = { done: boolean; by?: string; byName?: string; at?: number; photos: string[]; note?: string };
export type Checklist = { jobId: string; kind: string; items: Record<string, CheckEntry>; completedAt?: number; completedBy?: string; rev: number };
export type SopItem = { id: string; text: string; required?: boolean; photo?: boolean; noteLabel?: string };
