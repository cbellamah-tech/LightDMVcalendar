/* Job SOP checklists, from chris's installation and takedown SOPs (2026-10-06).
   required: the crew can't mark the job done until it's checked.
   photo: the box needs at least one photo before it can be checked.
   Items marked REQUIRED, and items that ask for a picture, are required. Edit here to change. */

export type SopCount = { key: "c9Feet" | "c7Bulbs" | "miniStrands" | "stakeFeet"; label: string };
/** counts: numbers the crew must enter before the box can be checked (materials used, for the ledger). */
/** noteRequired: the box can't be checked until the note is filled in. */
/** perPart: one photo for each part of the job (the Jobber line items: roofline, trees, wreaths...); the box checks itself. */
export type SopItem = { id: string; text: string; required?: boolean; photo?: boolean; perPart?: boolean; noteLabel?: string; noteRequired?: boolean; counts?: SopCount[] };

export const MATERIAL_COUNTS: SopCount[] = [
  // chris 2026-10-08: each one "if any"; a blank counts as none.
  { key: "miniStrands", label: "Mini light strands, if any" },
  { key: "c7Bulbs", label: "C7 bulbs, if any" },
  { key: "c9Feet", label: "Feet of C9 bulbs, if any (count the bulbs)" },
  { key: "stakeFeet", label: "Feet of stake lighting, if any" },
];
/** fix = a service call (Jobber visit or job titled "SERVICE ..."), kept apart from installs and takedowns. */
export type JobKind = "install" | "takedown" | "fix";

export const SOPS: Record<JobKind, { title: string; items: SopItem[] }> = {
  install: {
    title: "Installation SOP",
    items: [
      // Required pictures (chris, 2026-10-08): whole house on arrival, each part as it is set, goodie bag at the door,
      // our yard sign out front, the whole finished job, and the timer. Every one is copied to Drive by customer.
      { id: "arrival-photo", text: "Take a picture of the entire home on arrival", required: true, photo: true },
      { id: "merch", text: "Wear company merchandise" },
      { id: "triangle-sign", text: "Bring the triangle sign and set it up" },
      { id: "ladder-wind", text: "On windy days, tie the ladder down at the gutter", required: true },
      { id: "staples", text: "Staple only when necessary, on certain trees" },
      { id: "rubber-clamps", text: "Use big rubber clamps" },
      { id: "white-house-cord", text: "On a white house, use white wire extension for wreaths and jumps across the siding" },
      { id: "white-columns", text: "Use white wire minis on white columns" },
      { id: "part-photos", text: "Take a picture of each part of the job as it is being set", required: true, photo: true, perPart: true },
      { id: "timer", text: "Make sure the timer is set, and send a picture of it to the group chat", required: true, photo: true },
      { id: "finished-photos", text: "Take pictures of the entire finished job", required: true, photo: true },
      { id: "goodie-bag", text: "Leave a goodie bag at the front door and take a picture of it", required: true, photo: true },
      { id: "yard-sign", text: "Put our yard sign in front and take a picture of it", required: true, photo: true },
      { id: "materials", text: "Enter the material used on this job (leave blank what you didn't use)", required: true, counts: MATERIAL_COUNTS },
      { id: "review", text: "Ask for a Google review while wearing the review tag ($50)", noteLabel: "Customer said" },
      { id: "cross-sell", text: "Offer cross-sells (crew member gets 15% of the upsell price)", noteLabel: "Upsell sold and price" },
    ],
  },
  takedown: {
    title: "Takedown SOP",
    items: [
      { id: "ladder-wind", text: "On windy days, tie the ladder down at the gutter", required: true },
      { id: "no-tape", text: "No tape" },
      { id: "no-staples", text: "No staples" },
      { id: "female-ends", text: "Female the ends" },
      { id: "inlines", text: "Inlines" },
      { id: "phase-out-yellow", text: "Phase out the yellow-bottom lights" },
      { id: "phase-out-hd", text: "Phase out Home Depot lights" },
      { id: "takedown-photos", text: "Take takedown pictures", required: true, photo: true },
      { id: "cleanup", text: "Clean up after the job" },
      { id: "all-material", text: "Make sure we have all material before leaving" },
    ],
  },
  fix: {
    title: "Service call (fix)",
    items: [
      { id: "arrival-photo", text: "Take a picture of the problem on arrival", required: true, photo: true },
      { id: "ladder-wind", text: "On windy days, tie the ladder down at the gutter", required: true },
      { id: "work-done", text: "Write what you fixed", required: true, noteLabel: "What was wrong and what you did", noteRequired: true },
      { id: "after-photo", text: "Take a picture once it's fixed and lit", required: true, photo: true },
      { id: "timer", text: "Make sure the timer is set", required: true },
      { id: "cleanup", text: "Clean up after the job" },
    ],
  },
};

/* ---------- parts of a job, for the per-part photos ---------- */

// Quote lines that aren't something hung on the house: what's included, discounts, notes, design photos, services.
const NOT_A_PART = /(included|takedown|take down|maintenance|storage|discount|cash|timer|extension cord|design (photo|display)|^note$|reinstall|gutter|deposit|tax|fee|credit|payment|lease|travel|service call|repair)/i;

/** A quote line's name without the emoji and the "Optional | Click photo to preview" sales text. */
export function partName(raw: string): string {
  return raw
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu, "")
    .replace(/\s*[-|(]\s*optional\b.*$/i, "")
    .replace(/\s*\|\s*(click|optional).*$/i, "")
    .replace(/\s*-\s*click photo.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–|,]+|[\s\-–|,]+$/g, "")
    .trim();
}

/** The parts of a job a crew should photograph while setting: one per distinct line item. */
export function jobParts(lines: { name: string }[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const n = partName(l.name || "");
    if (!n || NOT_A_PART.test(n)) continue;
    if (!out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out.slice(0, 20);
}
