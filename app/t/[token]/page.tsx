import type { Metadata } from "next";
import Live from "./Live";

export const metadata: Metadata = { title: "Light DMV · Your crew, live", robots: { index: false, follow: false } };

/** A customer's live tracker link: no sign-in, no app frame. */
export default function TrackerLink({ params }: { params: { token: string } }) {
  return <Live token={params.token} />;
}
