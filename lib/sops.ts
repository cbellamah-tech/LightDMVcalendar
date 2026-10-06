/* Job SOP checklists, from chris's installation and takedown SOPs (2026-10-06).
   required: the crew can't mark the job done until it's checked.
   photo: the box needs at least one photo before it can be checked.
   Items marked REQUIRED, and items that ask for a picture, are required. Edit here to change. */

export type SopItem = { id: string; text: string; required?: boolean; photo?: boolean; noteLabel?: string };
export type JobKind = "install" | "takedown";

export const SOPS: Record<JobKind, { title: string; items: SopItem[] }> = {
  install: {
    title: "Installation SOP",
    items: [
      { id: "arrival-photo", text: "Take a picture of the house on arrival", required: true, photo: true },
      { id: "merch", text: "Wear company merchandise" },
      { id: "triangle-sign", text: "Bring the triangle sign and set it up" },
      { id: "ladder-wind", text: "On windy days, tie the ladder down at the gutter", required: true },
      { id: "staples", text: "Staple only when necessary, on certain trees" },
      { id: "rubber-clamps", text: "Use big rubber clamps" },
      { id: "white-house-cord", text: "On a white house, use a white wire extension cord for the wreath" },
      { id: "white-columns", text: "Use white wire minis on white columns" },
      { id: "timer", text: "Make sure the timer is set, and send a picture of it", required: true, photo: true },
      { id: "review", text: "Ask for a Google review while wearing the review tag ($50)", noteLabel: "Customer said" },
      { id: "goodie-bag", text: "Leave goodie bags" },
      { id: "yard-sign", text: "Put the yard sign in after the job is done" },
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
};
