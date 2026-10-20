import { bringAmount, type BringItem } from "./materials";

/* The crew note for one day: each crew's stops in order, with what's on the house, the bin, the notes that matter and the
   load list. Built on the server (lib/crewNotes.ts); this file is shared with the page, so it holds no server code. */

export type NoteJob = {
  jobId: string;
  start: string;
  time: string;           // "8:00 AM", or "" for an all-day visit
  kind: "install" | "takedown" | "fix";
  client: string;
  address: string;
  lines: string[];        // the facts: repeat or new, bin, what's on the house, photos
  notes: string[];        // what people wrote for the crew in Jobber, trimmed
  headsUp: string[];      // the notes boiled down by Claude (empty without a Claude key)
};
export type CrewNote = { crew: string; label: string; jobs: NoteJob[]; bring: BringItem[]; notRead: number };
export type DayNotes = { day: string; at: number; crews: CrewNote[]; ai: boolean };

const KIND = { install: "Install", takedown: "Takedown", fix: "Fix" } as const;

export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });

/** The note as plain text, to paste into a group text. */
export function crewNoteText(c: CrewNote, day: string): string {
  const out = [`${c.label}: ${dayLabel(day)}, ${c.jobs.length} stop${c.jobs.length === 1 ? "" : "s"}`];
  c.jobs.forEach((j, i) => {
    out.push("", `${i + 1}. ${j.time ? `${j.time} ` : ""}${KIND[j.kind]}: ${j.client}`, j.address);
    for (const l of j.lines) out.push(`- ${l}`);
    for (const n of j.headsUp.length ? j.headsUp : j.notes) out.push(`- ${n}`);
  });
  if (c.bring.length) {
    out.push("", "Load the van:");
    for (const b of c.bring) out.push(`- ${b.label}: ${bringAmount(b)}`);
  }
  return out.join("\n");
}
